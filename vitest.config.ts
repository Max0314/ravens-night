import { defineConfig } from "vitest/config";
import { audioPreviewCatalog } from './apps/web/audio-preview-catalog.mjs';

export default defineConfig({
  plugins: [audioPreviewCatalog()],
  test: {
    include: ["tests/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}"],
  },
});
