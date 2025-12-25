use futures::{
    channel::mpsc,
    io::{AsyncRead, AsyncWrite},
    task::{Context, Poll},
    StreamExt as _,
};
use pin_project::pin_project;
use std::pin::Pin;

#[pin_project]
pub struct WasmLspStdin {
    #[pin]
    receiver: mpsc::UnboundedReceiver<Vec<u8>>,
    buffer: Option<Vec<u8>>,
}

impl WasmLspStdin {
    pub fn new(receiver: mpsc::UnboundedReceiver<Vec<u8>>) -> Self {
        Self {
            receiver,
            buffer: None,
        }
    }
}

impl AsyncRead for WasmLspStdin {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        out: &mut [u8],
    ) -> Poll<std::io::Result<usize>> {
        let mut this = self.project();

        loop {
            // Drain buffer first
            if let Some(buf) = this.buffer.as_mut() {
                if !buf.is_empty() {
                    let n = out.len().min(buf.len());
                    out[..n].copy_from_slice(&buf[..n]);
                    buf.drain(..n);
                    return Poll::Ready(Ok(n));
                } else {
                    *this.buffer = None;
                }
            }

            match this.receiver.poll_next_unpin(cx) {
                Poll::Ready(Some(bytes)) => {
                    *this.buffer = Some(bytes);
                }
                Poll::Ready(None) => return Poll::Ready(Ok(0)), // EOF
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

#[pin_project]
pub struct WasmLspStdout {
    sender: mpsc::UnboundedSender<Vec<u8>>,
}

impl WasmLspStdout {
    pub fn new(sender: mpsc::UnboundedSender<Vec<u8>>) -> Self {
        Self { sender }
    }
}

impl AsyncWrite for WasmLspStdout {
    fn poll_write(
        mut self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        // Fire and forget (buffered channel)
        let _ = self.sender.unbounded_send(buf.to_vec());
        Poll::Ready(Ok(buf.len()))
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Poll::Ready(Ok(()))
    }

    fn poll_close(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Poll::Ready(Ok(()))
    }
}
