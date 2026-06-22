// Stub for `jsdom`.
//
// `hydro-js-integrations/server` statically imports `{ JSDOM } from "jsdom"`,
// but jsdom's transitive deps (e.g. @exodus/bytes via html-encoding-sniffer)
// don't resolve under Deno. We render with happy-dom (see `setRenderer` in
// src/entry-server.tsx), so JSDOM is never actually constructed — this stub
// just satisfies the static import. Vite swaps `jsdom` for this file via
// `resolve.alias` in vite.config.ts.
export class JSDOM {
  constructor() {
    throw new Error(
      "jsdom is stubbed out under Deno; the happy-dom renderer is used instead.",
    );
  }
}

export default { JSDOM };
