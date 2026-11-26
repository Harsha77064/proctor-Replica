// Server maintenance commands.
//   npm run cli -- create-admin --name "Jane Admin" --email jane@example.com --password '...'
//   npm run cli -- reset-password --email jane@example.com --password '...'
//   npm run cli -- seed-demo
//   npm run cli -- backup            (copies the database to DATA_DIR/backups)
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db, now, newId } from './db.js';
import { hashPassword, passwordProblem, revokeSessions } from './auth.js';
import { seedDemo } from './seed.js';

const [cmd, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, '')] = rest[i + 1];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (cmd === 'create-admin' || cmd === 'reset-password') {
  if (!args.email || !args.password) fail('Pass --email and --password.');
  const problem = passwordProblem(args.password);
  if (problem) fail(`Password: ${problem}`);
  const hash = await hashPassword(args.password);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(args.email.toLowerCase());
  if (cmd === 'create-admin') {
    if (existing) fail('A user with that email already exists. Use reset-password.');
    db.prepare('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId('USR'), args.name || 'Administrator', args.email.toLowerCase(), hash, 'admin', now());
    console.log(`Admin ${args.email} created.`);
  } else {
    if (!existing) fail('No user with that email.');
    db.prepare('UPDATE users SET password_hash = ?, active = 1 WHERE id = ?').run(hash, existing.id);
    revokeSessions('staff', existing.id);
    console.log(`Password reset for ${args.email}.`);
  }
} else if (cmd === 'backup') {
  const dir = path.join(config.dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `oversee-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`);
  await db.backup(file);
  console.log(`Database backed up to ${file}`);
} else if (cmd === 'seed-demo') {
  console.log(seedDemo() ? 'Demo data loaded.' : 'Skipped: the database already has candidates.');
} else {
  fail('Commands: create-admin, reset-password, seed-demo, backup');
}
