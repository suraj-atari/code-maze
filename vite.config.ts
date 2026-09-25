import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    // Rapier (lazy chunk) ships its WASM inlined as base64, so that one chunk is ~2.3 MB.
    chunkSizeWarningLimit: 3000,
  },
  server: {
    host: true,
  },
});
