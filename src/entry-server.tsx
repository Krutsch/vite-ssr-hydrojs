import { readFile } from "node:fs/promises";
import library from "hydro-js-integrations/server";
const { render: renderToDOM, renderRootToString } = await library;

const App = (await import("./App")).default; // Vite production buils fails, if it is not imported dynamically
document.write(await readFile("./index.html", "utf-8"));
renderToDOM(<App />, "#app", false);

export async function render(_url: string) {
  const html = renderRootToString();
  return { html };
}
