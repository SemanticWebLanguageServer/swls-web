import { LogLevel } from "@codingame/monaco-vscode-api";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
} from "vscode-languageclient/browser.js";
import {
  EditorApp,
  type EditorAppConfig,
} from "monaco-languageclient/editorApp";
import {
  LanguageClientWrapper,
  type LanguageClientConfig,
} from "monaco-languageclient/lcwrapper";
import {
  MonacoVscodeApiWrapper,
  type MonacoVscodeApiConfig,
} from "monaco-languageclient/vscodeApiWrapper";
import { ILanguageExtensionPoint } from "@codingame/monaco-vscode-api/vscode/vs/editor/common/languages/language";
import { editor } from "@codingame/monaco-vscode-editor-api";
import { LanguagesRegistry } from "@codingame/monaco-vscode-api/vscode/vs/editor/common/services/languagesRegistry";

import * as monaco from "@codingame/monaco-vscode-editor-api";

const workerUrl = "./lsp-worker.js";

export async function setupVscodeApi() {
  // Setup the default VSCode API wrapper
  const vscodeApiConfig: MonacoVscodeApiConfig = {
    $type: <any>"default", // switch from classic -> default
    viewsConfig: {
      $type: "EditorService",
    },
    logLevel: LogLevel.Debug,
    userConfiguration: {
      json: JSON.stringify({
        "editor.experimental.asyncTokenization": true,
        "editor.semanticHighlighting.enabled": true,
      }),
    },
    advanced: {
      enforceSemanticHighlighting: true,
    },
  };
  const apiWrapper = new MonacoVscodeApiWrapper(vscodeApiConfig);
  await apiWrapper.start();

  monaco.languages.register(turtleExtension);
  monaco.languages.register(sparqlLdExtension);
  monaco.languages.register(jsonLdExtension);
}

export async function setupLsp(...languageIds: string[]) {
  const worker = new Worker(new URL(workerUrl, import.meta.url), {
    type: "module",
  });
  const reader = new BrowserMessageReader(worker);
  const writer = new BrowserMessageWriter(worker);

  const languageClientConfig: LanguageClientConfig = {
    languageId: "swls",
    clientOptions: {
      documentSelector: languageIds,
    },
    connection: {
      options: {
        $type: "WorkerDirect",
        worker,
      },
      messageTransports: { reader, writer },
    },
  };

  // Start language client wrapper
  const languageClientWrapper = new LanguageClientWrapper(languageClientConfig);
  await languageClientWrapper.start();

  languageClientWrapper
    .getLanguageClient()
    .onRequest("custom/readFile", (a, b, c) => {
      console.log({ a, b, c });
      throw "nah";
    });
}

export const turtleExtension: ILanguageExtensionPoint = {
  id: "turtle",
  extensions: [".ttl"],
  aliases: ["Turtle", "turtle"],
  mimetypes: ["text/turtle"],
};
export const jsonLdExtension: ILanguageExtensionPoint = {
  id: "jsonld",
  extensions: [".jsonld"],
  aliases: ["JSON-LD", "turtle"],
  mimetypes: ["application/ld+json"],
};

export const sparqlLdExtension: ILanguageExtensionPoint = {
  id: "sparql",
  extensions: [".sq", ".rq"],
  aliases: ["SPARQL"],
  mimetypes: [
    "application/sparql-query",
    "application/sparql",
    "application/sparql-update",
  ],
};

export async function addEditor(
  uri: string,
  code: string,
  extension: ILanguageExtensionPoint,
  container: HTMLElement,
): Promise<EditorApp> {
  const editorAppConfig: EditorAppConfig = {
    codeResources: {},
    // languageDef: { languageExtensionConfig: extension },
  };

  const editorApp = new EditorApp(editorAppConfig);

  await editorApp.start(container);

  const model = editor.createModel("ex:a ex:b ex:c .", "turtle");
  editorApp.getEditor().setModel(model);
  return editorApp;
}

export const runClient = async () => {
  await setupVscodeApi();

  const code = `@prefix : <http://example.org/> .`;
  const codeUri = "/workspace/model.ttl";

  const e = await addEditor(
    codeUri,
    code,
    turtleExtension,
    document.getElementById("monaco-editor-root")!,
  );

  // Language client configuration
  await setupLsp(turtleExtension.id, sparqlLdExtension.id, jsonLdExtension.id);
};

runClient();
