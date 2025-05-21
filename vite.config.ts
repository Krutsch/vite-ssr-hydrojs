import { defineConfig } from "vite";
import hydroJS from "hydro-js-integrations/vite";

// https://vite.dev/config/
export default defineConfig({
  build: {
    target: "esnext",
  },
  plugins: [hydroJS()],
});
