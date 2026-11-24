# Proctor Replica

An online-proctoring admin console inspired by Proctor 360, built with React + Vite.
All data is mock/demo data stored in the browser (`localStorage`), so no backend is needed.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

## Sections

| Section | What it does |
|---|---|
| **Dashboard** | Total / active / inactive / online candidates, live & completed exams, average / highest / lowest score, warnings, cheating flags. Candidate table with User ID, department, status, presence, flags, **Assign Exam**, activate/deactivate, add candidate. |
| **Question Bank** | Create new banks, view/edit existing ones, add/delete MCQs with difficulty. Seeded with React JS, Selenium, Python, Java OOPs, JavaScript, SQL and DevOps banks. |
| **Exams** | Scheduled / Live / Completed tabs. Schedule exams from a bank, start, end, delete. Live view shows a proctoring grid per candidate with warnings and flags. |
| **Results** | Score, correct answers, time taken, **Pass / Fail**, pass rate; filter by exam and outcome. |
| **Feedback** | Organization → candidate feedback with rating and message; linked from Results. |
| **Audit Logs** | Per-candidate summary (name, last active, last event, normal events, warnings, validations) and a full event log with CSV export. |
| **Reports** | Pass/fail per exam, score distribution, department averages, candidate status, warning types, high-risk candidates, CSV exports. |
| **Settings** | Organization (company URL, logo URL, support email), exam details, security/proctoring and notification settings. "Reset Demo Data" restores seed data. |

## Structure

```
src/
  App.jsx                 layout, sidebar, routes
  context/StoreContext.jsx  app state + actions (persisted to localStorage)
  data/mockData.js        deterministic seed data
  components/UI.jsx       shared UI (cards, badges, modal, tabs, toggles)
  pages/                  one file per section
```
