#![doc(
    html_logo_url = "https://ajuvercr.github.io/semantic-web-lsp/assets/icons/favicon.png",
    html_favicon_url = "https://ajuvercr.github.io/semantic-web-lsp/assets/icons/favicon.ico"
)]

mod channels;
mod client;
mod fetch;

use js_sys::Uint8Array;

use std::{cell::RefCell, io::Write, rc::Rc};

use bevy_ecs::{resource::Resource, world::World};
use client::{WebClient, WebFs};
use futures::{
    channel::mpsc::{unbounded, UnboundedSender},
    StreamExt,
};
use lsp_core::lsp_types::SemanticTokenType;
use lsp_core::prelude::*;
use tower_lsp::{LspService, Server};
use tracing::level_filters::LevelFilter;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;

use crate::channels::{WasmLspStdin, WasmLspStdout};

type LogSink = dyn Fn(String);
thread_local! {
    static LOG_SINK: Rc<RefCell<Box<LogSink>>> =
        Rc::new(RefCell::new(Box::new(|msg| {
            web_sys::console::log_1(&msg.into());
        })));
}

struct LogItWriter;
impl LogItWriter {
    fn new() -> Self {
        LogItWriter
    }
}

impl Write for LogItWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        match std::str::from_utf8(buf) {
            Ok(st) => {
                LOG_SINK.with(|sink| {
                    (sink.borrow())(st.to_string());
                });
            }
            Err(e) => web_sys::console::log_1(&format!("Invalid string logged {:?}", e).into()),
        }

        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn setup_global_subscriber() {
    use tracing_subscriber::prelude::*;

    let fmt_layer = tracing_subscriber::fmt::layer()
        .pretty()
        .with_ansi(false)
        .without_time() // std::time is not available in browsers
        .with_writer(std::sync::Mutex::new(LogItWriter::new()))
        .with_filter(LevelFilter::DEBUG);

    tracing_subscriber::registry().with(fmt_layer).init();
}

fn setup_world<C: Client + ClientSync + Resource + Clone>(
    client: C,
    tower_client: &tower_lsp::Client,
) -> (CommandSender, Vec<SemanticTokenType>) {
    let mut world = World::new();

    setup_schedule_labels::<C>(&mut world);

    let (publisher, mut rx) = DiagnosticPublisher::new();
    world.insert_resource(publisher);

    let c = client.clone();
    client.spawn(async move {
        while let Some(x) = rx.next().await {
            c.publish_diagnostics(x.uri, x.diagnostics, x.version).await;
        }
    });

    lang_turtle::setup_world::<C>(&mut world);
    lang_jsonld::setup_world(&mut world);
    lang_sparql::setup_world(&mut world);

    let (tx, mut rx) = unbounded();
    let sender = CommandSender(tx);
    world.insert_resource(sender.clone());
    world.insert_resource(client.clone());
    world.insert_resource(WebFs::new(tower_client));

    let r = world.resource::<SemanticTokensDict>();
    let mut semantic_tokens: Vec<_> = (0..r.0.len()).map(|_| SemanticTokenType::KEYWORD).collect();
    r.0.iter()
        .for_each(|(k, v)| semantic_tokens[*v] = k.clone());

    client.spawn(async move {
        while let Some(mut x) = rx.next().await {
            world.commands().append(&mut x);
            world.flush();
        }
    });

    (sender, semantic_tokens)
}

#[wasm_bindgen(start)]
pub async fn start_wasm_lsp() {
    console_error_panic_hook::set_once();
    web_sys::console::log_1(&"🚀 Tower-LSP WASM ready".into());
    setup_global_subscriber()
}

/// A self-contained WASM LSP instance that JS can create.
#[wasm_bindgen]
pub struct WasmLsp {
    from_js_tx: UnboundedSender<Vec<u8>>,
}

#[wasm_bindgen]
impl WasmLsp {
    /// JS must pass a callback for receiving messages from Rust/WASM.
    #[wasm_bindgen(constructor)]
    pub fn new(post_message_cb: js_sys::Function, debug_cb: Option<js_sys::Function>) -> WasmLsp {
        {
            if let Some(debug_cb) = debug_cb {
                LOG_SINK.with(move |sink| {
                    *sink.borrow_mut() = Box::new(move |st| {
                        let _ = debug_cb.call1(&JsValue::NULL, &JsValue::from_str(&st));
                    });
                });
            }
        }

        let (from_js_tx, from_js_rx) = unbounded::<Vec<u8>>();
        let (to_js_tx, mut to_js_rx) = unbounded::<Vec<u8>>();

        let stdin = WasmLspStdin::new(from_js_rx);
        let stdout = WasmLspStdout::new(to_js_tx);

        let instance = WasmLsp { from_js_tx };

        // spawn forwarding task
        spawn_local(async move {
            while let Some(bytes) = to_js_rx.next().await {
                let buffer = Uint8Array::from(bytes.as_slice());
                let _ = post_message_cb.call1(&JsValue::NULL, &buffer);
            }
        });

        spawn_local(async move {
            let (service, socket) = LspService::build(|client| {
                let (sender, rt) = setup_world(WebClient::new(client.clone()), &client);
                Backend::new(sender, client, rt)
            })
            .finish();

            Server::new(stdin, stdout, socket).serve(service).await;
        });

        instance
    }

    /// Send a message from JS → LSP.
    #[wasm_bindgen]
    pub fn send(&self, msg: &str) {
        let _ = self.from_js_tx.unbounded_send(msg.as_bytes().to_vec());
    }
}
