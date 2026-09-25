import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { geosimApi } from './server/apiPlugin.ts';

export default defineConfig({
  plugins: [react(), geosimApi()],
  server: {
    // Le serveur local n'écoute que sur la machine (SPEC §3).
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: 'localhost',
  },
  worker: {
    format: 'es',
  },
});
