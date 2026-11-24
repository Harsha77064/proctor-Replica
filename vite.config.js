import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { signalingPlugin } from './server/signaling.js';

// `npm run dev:lan` sets OVERSEE_HTTPS=1: browsers only allow camera access on
// https:// (or localhost), so other devices on the network need HTTPS.
const https = process.env.OVERSEE_HTTPS === '1';

export default defineConfig({
  plugins: [react(), signalingPlugin(), ...(https ? [basicSsl()] : [])],
});
