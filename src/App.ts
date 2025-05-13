import { reactive, html } from "hydro-js";

export default function App() {
  const count = reactive(0);

  return html`<div id="app">
    <a href="https://vite.dev" target="_blank">
      <img src="/vite.svg" class="logo" alt="Vite logo" />
    </a>

    <h1>Hello Vite!</h1>
    <div class="card">
      <button onclick="${() => count((val: typeof count) => val + 1)}">
        count is ${count}
      </button>
    </div>
    <p>Edit <code>src/app.tsx</code> and save to test HMR</p>
  </div> `;
}
