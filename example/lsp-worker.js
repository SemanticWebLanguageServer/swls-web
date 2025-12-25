let initialized = false;
let send_to_lsp;
async function handleIncomingMessage(event) {
  await ensureLspLoaded();

  const payload =
    typeof event.data === "string" ? event.data : JSON.stringify(event.data);

  const framed = `Content-Length: ${payload.length}\r\n\r\n${payload}`;
  send_to_lsp(framed);
}

class LspDeframer {
  buffer = "";
  onMessage;

  constructor(onMessage) {
    this.onMessage = onMessage;
  }

  push(data) {
    this.buffer += data;

    while (true) {
      // Look for header terminator
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break; // incomplete header

      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length: (\d+)/i);
      if (!match) {
        console.error("Invalid LSP header", header);
        this.buffer = ""; // discard invalid data
        break;
      }

      const length = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;

      if (this.buffer.length < bodyEnd) break; // incomplete body

      const bodyStr = this.buffer.slice(bodyStart, bodyEnd);
      try {
        const msg = JSON.parse(bodyStr);
        this.onMessage(msg);
      } catch (e) {
        console.error("Invalid JSON body", bodyStr, e);
      }

      // Remove processed message from buffer
      this.buffer = this.buffer.slice(bodyEnd);
    }
  }
}

let deframer = new LspDeframer((msg) => {
  postMessage(msg);
});

async function ensureLspLoaded() {
  if (!initialized) {
    console.log("[worker] importing swls-web…");
    const mod = await import("swls-web");
    console.dir(mod);
    const t = new mod.WasmLsp((x) => deframer.push(x));
    initialized = true;
    send_to_lsp = t.send.bind(t);
  }
}

onmessage = handleIncomingMessage;
