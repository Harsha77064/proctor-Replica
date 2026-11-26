import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// In development the API + proctoring server runs separately (server/index.js,
// port 3001) and Vite forwards /api and /signal to it.
// `npm run dev:lan` sets OVERSEE_HTTPS=1: browsers only allow camera access on
// https:// (or localhost), so other devices on the network need HTTPS.
const https = process.env.OVERSEE_HTTPS === '1';
const backend = `http://localhost:${process.env.API_PORT || 3001}`;

export default defineConfig({
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  server: {
    proxy: {
      '/api': { target: backend },
      '/signal': {
        target: backend,
        ws: true,
        // A browser tab closing mid-connection is normal; don't print it as an error.
        configure: (proxy) => proxy.on('error', () => {}),
      },
    },
  },
});
