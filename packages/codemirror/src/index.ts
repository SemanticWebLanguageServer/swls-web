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

import * as monaco from "@codingame/monaco-vscode-editor-api";
import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";

/**
 * Default way to setup the vscode api, adding turtle, sparql and jsonld extensions.
 */
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
        // "editor.experimental.asyncTokenization": true,
        "editor.semanticHighlighting.enabled": true,
      }),
    },
    advanced: {
      loadThemes: true,
      enforceSemanticHighlighting: true,
    },
  };
  const apiWrapper = new MonacoVscodeApiWrapper(vscodeApiConfig);
  await apiWrapper.start();

  monaco.languages.register(turtleExtension);
  monaco.languages.register(sparqlLdExtension);
  monaco.languages.register(jsonLdExtension);
}

export type LspOptions = {
  ontologies?: string[];
  shapes?: string[];
};
/**
 * Sets up the semantic web language server that can handle the provided language ids.
 */
export async function setupLsp(
  url: URL,
  options: LspOptions,
  ...languageIds: string[]
): Promise<LanguageClientWrapper> {
  const worker = new Worker(url, {
    type: "module",
  });
  const reader = new BrowserMessageReader(worker);
  const writer = new BrowserMessageWriter(worker);

  const languageClientConfig: LanguageClientConfig = {
    languageId: "swls",
    clientOptions: {
      documentSelector: languageIds,
      initializationOptions: options,
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
  return languageClientWrapper;
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

/**
 * Adds an editor to the html element
 */
export async function addEditor(
  uri: string,
  code: string,
  extension: ILanguageExtensionPoint,
  container: HTMLElement,
): Promise<EditorApp> {
  const editorAppConfig: EditorAppConfig = {
    codeResources: {},
  };

  const editorApp = new EditorApp(editorAppConfig);

  await editorApp.start(container);

  const model = editor.createModel(code, extension.id, URI.parse(uri));
  editorApp.getEditor()!.setModel(model);
  return editorApp;
}
