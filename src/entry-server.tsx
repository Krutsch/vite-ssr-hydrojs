import { readFile } from "node:fs/promises";
import { renderRootToString, getLibrary } from "hydro-js-integrations/server";
const { render: renderToDOM, html, $ } = await getLibrary();

const htmlFile = await readFile("./index.html", "utf-8");
renderToDOM(
  html`${htmlFile.replace(/<!DOCTYPE html>/i, "")}`,
  $("html")!,
  false
);

const App = (await import("./App")).default; // Vite production buils fails, if it is not imported dynamically
renderToDOM(<App />, $("#app")!, false);

export async function render(_url: string) {
  const html = renderRootToString();
  return { html };
}
