# Oversee

**Smart online proctoring & assessment platform.** Admins build question banks, schedule
exams and invite candidates; candidates take the exam in their browser while proctors
watch their camera and microphone live.

- **Frontend:** React 18 + Vite, React Router, Recharts, Lucide icons
- **Backend:** Node.js + Express, SQLite (better-sqlite3), WebSocket signaling (ws)
- **Live video:** WebRTC, browser to browser, with a TURN relay for strict networks
- **Deployment:** Docker Compose with Caddy (automatic HTTPS) and coturn — see **[DEPLOY.md](DEPLOY.md)**

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The first visit shows **Set up Oversee**: create your
organization and admin account (tick "Load demo data" to try it with sample data).

`npm run dev` starts two processes: the API + proctoring server on port 3001 and the
Vite dev server on 5173 (which forwards `/api` and `/signal` to the server). Data is
stored in `./data` (database and recordings).

**Try a proctored exam on one computer**
1. Exams → Live tab (or Start Now on a scheduled exam) → **Invitations** → tick a candidate → **Create links**.
2. Open the link in a different browser (or a private window) and enter the access code.
3. Allow the camera, start the exam, and watch it under **Live Monitoring**.

**Other devices on your network:** browsers only allow cameras on `https://` or
`localhost`, so run `npm run dev:lan` and use the `https://<your-ip>:5173` address it
prints (accept the self-signed certificate warning once).

## Production

```bash
npm run build
NODE_ENV=production npm start      # serves the app, API and signaling on port 3000
```

For a real deployment with HTTPS, TURN and backups use Docker Compose: **[DEPLOY.md](DEPLOY.md)**.
Configuration is via environment variables; see [.env.example](.env.example).

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything: candidates, question banks, exams, invitations, settings, users |
| **Proctor** | Monitor live exams, record, warn, flag, terminate, send feedback; read-only elsewhere; never sees answer keys |
| **Candidate** | Signs in with a personal invitation link + access code; takes only their assigned exam |

## Sections

| Section | What it does |
|---|---|
| **Dashboard** | Candidate stats (total, active, inactive, online), live and completed exams, average / highest / lowest score, warnings, cheating flags; candidate table with user ID, department, status and **Assign Exam**. |
| **Question Bank** | Create banks and multiple-choice questions with difficulty. Demo banks: React JS, Selenium, Python, Java OOPs, JavaScript, SQL, DevOps. |
| **Exams** | Scheduled / Live / Completed. Schedule, start, end, delete; **Invitations** creates personal links + access codes and can email them. |
| **Results** | Server-scored results with Pass / Fail, pass rate and filters. |
| **Feedback** | Organization → candidate feedback with a rating. |
| **Live Monitoring** | Real-time camera + microphone of every candidate. Record (saved on the server), snapshot, listen, message, warn, flag, terminate. Integrity alerts arrive live. |
| **Candidate portal** (`/exam`) | Access-code sign-in, camera/microphone/connection check, consent, full-screen timed exam. Answers save as they go and survive a reload. Tab switches, focus loss, leaving full screen, copy/paste, blocked shortcuts and a covered or disconnected camera are reported and logged. |
| **Audit Logs** | Per-candidate summary and full event log (who did what, when, from which IP), CSV export. |
| **Reports** | Charts and CSV exports. |
| **Settings** | Organization (company URL, logo URL, support email), exam defaults, security, notifications. |
| **Users** | Add admins and proctors, change roles, reset passwords, deactivate; change your own password. |

## Project structure

```
server/
  index.js        Express app: security headers, API, static files, background jobs
  api.js          REST API (staff + candidate routes, validation, permissions)
  signaling.js    Authenticated WebSocket relay for WebRTC + live proctoring events
  services.js     Scoring, attempts, proctoring events, data serializers
  auth.js         scrypt passwords, cookie sessions, role checks
  db.js           SQLite schema and migrations
  mailer.js       Invitation emails (SMTP)
  ice.js          STUN/TURN config with short-lived TURN credentials
  seed.js, cli.js Demo data; admin/backup commands (npm run cli -- <command>)
src/
  App.jsx                    Routing, sign-in gate, layout
  api.js                     Fetch wrapper
  context/                   Auth and data stores
  live/                      WebRTC + signaling client, admin live context
  pages/                     One file per section, plus Login, Setup, Users, CandidatePortal
tests/run.mjs                API test suite (npm test)
Dockerfile, docker-compose.yml, deploy/Caddyfile, DEPLOY.md
```

## Tests

```bash
npm test
```

Starts a throwaway server with an empty database and checks sign-in, roles, invitations,
the candidate exam flow, server-side scoring, recordings and security headers.

The test server uses a random port from 3900–3989. To choose one:

```bash
npm test -- --port 4500
```

or set `TEST_PORT=4500`. If the port is busy the test says so and suggests another.
