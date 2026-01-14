import {
  addEditor,
  jsonLdExtension,
  setupLsp,
  setupVscodeApi,
  sparqlLdExtension,
  turtleExtension,
} from "swls-codemirror";

import workerUrl from "swls-codemirror/lib/lsp-worker.js?url";

const runClient = async () => {
  await setupVscodeApi();

  const code = `@prefix : <http://example.org/> .`;
  const codeUri = "inmemory://app/model.ttl";

  const e = await addEditor(
    codeUri,
    code,
    turtleExtension,
    document.getElementById("monaco-editor-root")!,
  );

  // Language client configuration
  const thing = await setupLsp(
    workerUrl,
    turtleExtension.id,
    sparqlLdExtension.id,
    jsonLdExtension.id,
  );

  thing.getLanguageClient()!.onRequest("custom/readFile", (a, b, c) => {
    // You can return generated files here
    console.log("read", a, b, c);
    throw "nah";
  });
};

runClient();
