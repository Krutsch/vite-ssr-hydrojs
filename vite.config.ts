import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import hydroJS from "hydro-js-integrations/vite";

// https://vite.dev/config/
export default defineConfig({
  build: {
    target: "esnext",
  },
  plugins: [hydroJS()],
  resolve: {
    alias: {
      // jsdom doesn't resolve under Deno; we render with happy-dom, so replace
      // the integration's static `import { JSDOM } from "jsdom"` with a stub.
      jsdom: fileURLToPath(new URL("./stubs/jsdom.js", import.meta.url)),
    },
  },
  ssr: {
    // Bundle the integration during SSR so the alias above can rewrite its
    // jsdom import (externalized modules would bypass resolve.alias).
    noExternal: ["hydro-js-integrations"],
  },
});
