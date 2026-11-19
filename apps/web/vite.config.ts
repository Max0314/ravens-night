import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { audioPreviewCatalog } from './audio-preview-catalog.mjs';

export default defineConfig({
  plugins: [react(), audioPreviewCatalog()],
  server: { proxy: { "/api": { target: "http://127.0.0.1:3000", ws: true }, "/healthz": "http://127.0.0.1:3000" } },
  build: { target: "es2022", sourcemap: true },
});
