// Starts a throwaway Oversee server with an empty database, creates the first
// admin (with demo data), then runs the API checks against it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oversee-test-'));
const port = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'test', PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, SMTP_HOST: '', TURN_URLS: '' },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const cleanup = () => {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
};

try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (i > 50) throw new Error('Server did not start');
    await new Promise((r) => setTimeout(r, 200));
  }
  const setup = await fetch(`${base}/api/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test Admin', email: 'admin@example.com', password: 'Str0ngPassw0rd', orgName: 'Test Org', loadDemo: true }),
  });
  if (!setup.ok) throw new Error(`Setup failed: ${setup.status}`);
  const code = await new Promise((resolve) => {
    spawn(process.execPath, ['tests/api.test.mjs', base], { cwd: root, stdio: 'inherit' }).on('exit', resolve);
  });
  cleanup();
  process.exit(code ?? 1);
} catch (err) {
  console.error(err.message);
  cleanup();
  process.exit(1);
}
