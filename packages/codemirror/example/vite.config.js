import importMetaUrlPlugin from "@codingame/esbuild-import-meta-url-plugin";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default {
  worker: {
    format: "es",
  },
  plugins: [wasm(), topLevelAwait(), importMetaUrlPlugin],
  build: {
    target: "esnext",
  },
  resolve: {
    dedupe: ["vscode"],
  },
};
