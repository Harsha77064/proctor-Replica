# Oversee

**Smart online proctoring & assessment platform** — an admin console built with React + Vite.
All data is mock/demo data stored in the browser (`localStorage`), so no backend is needed.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

## Live proctoring

`npm run dev` also starts the proctoring server (a small WebSocket relay in
`server/signaling.js`). Camera video goes directly between the candidate's and the
admin's browsers; the server only helps them connect.

**Try it on one computer**
1. Open http://localhost:5173/live-monitoring (admin).
2. Click **Open Candidate Portal** (opens http://localhost:5173/exam in a new tab), pick a demo candidate, allow the camera, and start the exam.
3. The candidate's camera appears on the admin's Live Monitoring page.

**Candidates on other devices (same network)**
Browsers only allow camera access on `https://` or `localhost`, so run:

```bash
npm run dev:lan
```

and give candidates the `https://<your-computer-ip>:5173/exam` address that Vite prints.
The certificate is self-signed, so browsers show a warning the first time; click
**Advanced → Proceed**.

**Before using it for real exams**
- Anyone who can open the admin pages can watch the feeds — add a login first.
- Data is stored per browser (`localStorage`), so candidates on another device only
  see the demo candidates and exams. A real database/backend is needed for that.
- For candidates on different networks, deploy over HTTPS and add a TURN server
  to `ICE_CONFIG` in `src/live/signaling.js`.

## Sections

| Section | What it does |
|---|---|
| **Dashboard** | Total / active / inactive / online candidates, live & completed exams, average / highest / lowest score, warnings, cheating flags. Candidate table with User ID, department, status, presence, flags, **Assign Exam**, activate/deactivate, add candidate. |
| **Question Bank** | Create new banks, view/edit existing ones, add/delete MCQs with difficulty. Seeded with React JS, Selenium, Python, Java OOPs, JavaScript, SQL and DevOps banks. |
| **Exams** | Scheduled / Live / Completed tabs. Schedule exams from a bank, start, end, delete. Live view shows a proctoring grid per candidate with warnings and flags. |
| **Results** | Score, correct answers, time taken, **Pass / Fail**, pass rate; filter by exam and outcome. |
| **Feedback** | Organization → candidate feedback with rating and message; linked from Results. |
| **Live Monitoring** | Real-time camera + microphone feeds of every candidate taking a live exam (WebRTC). The proctor can record sessions (downloadable video), take snapshots, listen in, message or warn the candidate, flag for cheating, or terminate the exam. Integrity alerts stream in live. |
| **Candidate Portal** (`/exam`) | Candidates sign in with their ID, pass a camera / microphone / connection check, consent to monitoring, then take the exam in full screen. Tab switches, losing focus, leaving full screen, copy/paste and shortcut attempts, a covered camera and a disconnected camera are reported to the proctor and logged. |
| **Audit Logs** | Per-candidate summary (name, last active, last event, normal events, warnings, validations) and a full event log with CSV export. |
| **Reports** | Pass/fail per exam, score distribution, department averages, candidate status, warning types, high-risk candidates, CSV exports. |
| **Look & feel** | Light / dark theme toggle, global candidate search (Ctrl K), proctoring-alert notifications, responsive layout for phones and tablets. |
| **Settings** | Organization (company URL, logo URL, support email), exam details, security/proctoring and notification settings. "Reset Demo Data" restores seed data. |

## Structure

```
src/
  App.jsx                 layout, sidebar, top bar (search, theme, alerts), routes
  context/StoreContext.jsx  app state + actions (persisted to localStorage)
  live/                   WebRTC + signaling client, admin LiveContext
server/signaling.js       WebSocket relay used by npm run dev / preview
  data/mockData.js        deterministic seed data
  components/UI.jsx       shared UI (cards, badges, modal, tabs, toggles)
  pages/                  one file per section
```
