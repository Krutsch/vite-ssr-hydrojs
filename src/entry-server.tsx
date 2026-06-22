import {
  renderToString,
  getLibrary,
  setRenderer,
} from "hydro-js-integrations/server";
setRenderer("happy-dom");
const { render: renderToDOM, html, $ } = await getLibrary();

const htmlFile = await Deno.readTextFile("./index.html");
renderToDOM(
  html`${htmlFile.replace(/<!DOCTYPE html>/i, "")}`,
  $("html")!,
  false,
);

const App = (await import("./App")).default; // Vite production buils fails, if it is not imported dynamically
renderToDOM(<App />, $("#app")!, false);

export async function render(_url: string) {
  // Serialize the inner content of #app (not the whole document) so the
  // server template's `<div id="app"><!--app-html--></div>` stays flat.
  const html = renderToString($("#app")!);
  return { html };
}
