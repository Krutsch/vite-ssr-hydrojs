import library from "hydro-js/server";
const { render: renderToDOM, $, renderToString } = await library;

const App = (await import("./App")).default; // Vite production buils fails, if it is not imported dynamically
renderToDOM(App(), $("#app")!, false);

export async function render(_url: string) {
  const html = renderToString();
  return { html };
}
