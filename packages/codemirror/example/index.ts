import {
  addEditor,
  jsonLdExtension,
  setupLsp,
  setupVscodeApi,
  sparqlLdExtension,
  turtleExtension,
} from "swls-codemirror";

import semwebUrl from "./ontologies/semweb.ttl?url";
import kgcOntology from "./ontologies/kgc-ontology.ttl?url";
import kgcShapes from "./ontologies/kgc-shapes.ttl?url";

import workerUrl from "swls-codemirror/lib/lsp-worker.js?url";

const runClient = async () => {
  await setupVscodeApi();

  const code = `@prefix rml: <http://w3id.org/rml/> .
  # @prefix rml2: 			<http://semweb.mmlab.be/ns/rml#> .
`;
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
    {
      ontologies: [
        new URL(semwebUrl, window.location.origin).toString(),
        new URL(kgcOntology, window.location.origin).toString(),
      ],
      shapes: [new URL(kgcShapes, window.location.origin).toString()],
    },
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
