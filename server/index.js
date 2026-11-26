// Oversee server: REST API + WebSocket signaling + the built web app, on one port.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { api } from './api.js';
import { attachSignaling } from './signaling.js';
import { sweepExpiredAttempts } from './services.js';
import { purgeExpiredSessions } from './auth.js';
import { emailEnabled } from './mailer.js';

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.production ? { maxAge: 15552000, includeSubDomains: false } : false,
  })
);
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), fullscreen=(self), geolocation=()');
  next();
});
app.use(cookieParser());
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, api);

// Serve the built front end (npm run build) when it exists.
const indexHtml = path.join(config.distDir, 'index.html');
if (fs.existsSync(indexHtml)) {
  app.use(express.static(config.distDir, {
    index: false,
    setHeaders: (res, file) => {
      if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
} else {
  app.get('/', (req, res) => res.type('text').send('Oversee API is running. Start the web app with `npm run dev`, or run `npm run build` first.'));
}

const server = http.createServer(app);
attachSignaling(server);

setInterval(() => {
  try {
    sweepExpiredAttempts();
    purgeExpiredSessions();
  } catch (err) {
    console.error('[sweep]', err);
  }
}, 30000).unref();

server.listen(config.port, config.host, () => {
  console.log(`Oversee server listening on http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log(`  data directory: ${config.dataDir}`);
  console.log(`  email invitations: ${emailEnabled() ? 'on' : 'off (set SMTP_* to enable)'}`);
  console.log(`  TURN relay: ${config.ice.turn.length ? 'on' : 'off (set TURN_URLS to enable)'}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
