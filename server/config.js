// Runtime configuration, read from environment variables (see .env.example).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader so `npm run dev` / `npm start` pick up a local .env file.
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const env = process.env;
const production = env.NODE_ENV === 'production';
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  root,
  production,
  port: Number(env.PORT) || (production ? 3000 : 3001),
  host: env.HOST || '0.0.0.0',
  dataDir: path.resolve(root, env.DATA_DIR || 'data'),
  distDir: path.join(root, 'dist'),
  // Public URL used in invitation links, e.g. https://exams.example.com
  publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : production,
  trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === '1' : production,
  staffSessionHours: Number(env.SESSION_HOURS) || 12,
  inviteValidDays: Number(env.INVITE_VALID_DAYS) || 14,
  maxRecordingMb: Number(env.MAX_RECORDING_MB) || 1024,
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE === '1',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || '',
  },
  ice: {
    stun: list(env.STUN_URLS || 'stun:stun.l.google.com:19302'),
    turn: list(env.TURN_URLS),
    // Either a coturn "static-auth-secret" (preferred: short-lived credentials)…
    turnSecret: env.TURN_SECRET || '',
    // …or a fixed username/password.
    turnUsername: env.TURN_USERNAME || '',
    turnCredential: env.TURN_CREDENTIAL || '',
  },
};

if (production && /change-me/i.test(config.ice.turnSecret)) {
  console.error('TURN_SECRET is still the example value. Set a long random secret in .env (openssl rand -hex 32).');
  process.exit(1);
}

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'recordings'), { recursive: true });
