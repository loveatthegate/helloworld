import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { lvzhiApiPlugin } from "./server/vite-plugin-api";

export default defineConfig({
  plugins: [react(), tailwindcss(), lvzhiApiPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
});
