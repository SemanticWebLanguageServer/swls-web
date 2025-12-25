import {
  createConnection,
  BrowserMessageReader,
  BrowserMessageWriter,
  TextDocuments,
  DiagnosticSeverity,
} from "vscode-languageserver/browser";

// Connect worker messaging to LSP
const reader = new BrowserMessageReader(self);
const writer = new BrowserMessageWriter(self);
const connection = createConnection(reader, writer);

// Track text documents in the worker
const documents = new TextDocuments();
documents.listen(connection);

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: documents.syncKind,
    completionProvider: {},
  },
}));

// Example completions
connection.onCompletion(() => {
  return [
    { label: "HelloWorld", kind: 1 },
    { label: "Foo", kind: 1 },
  ];
});

// Example diagnostics
documents.onDidChangeContent((change) => {
  const text = change.document.getText();
  const diagnostics = [];

  if (text.includes("error")) {
    diagnostics.push({
      severity: DiagnosticSeverity.Warning,
      message: "The word 'error' is not allowed!",
      range: {
        start: change.document.positionAt(text.indexOf("error")),
        end: change.document.positionAt(text.indexOf("error") + 5),
      },
    });
  }

  connection.sendDiagnostics({
    uri: change.document.uri,
    diagnostics,
  });
});

connection.listen();
