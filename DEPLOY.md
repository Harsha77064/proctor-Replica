# Deploying Oversee

This guide puts Oversee on the internet at your own domain with HTTPS, so
candidates can take proctored exams from anywhere.

One server runs three containers (see `docker-compose.yml`):

| Container | What it does |
|---|---|
| **app** | Oversee: web app, API, live-proctoring relay, SQLite database, recordings |
| **caddy** | HTTPS with free, auto-renewing Let's Encrypt certificates. Browsers only allow camera access over HTTPS. |
| **turn** | coturn relay. Carries camera video when a candidate's network blocks a direct connection (office firewalls, some mobile networks). |

## What you need

- A Linux server (Ubuntu 22.04/24.04) with a **public IP address**.
  2 vCPU / 2 GB RAM is plenty to start, e.g. DigitalOcean, AWS Lightsail, Hetzner, Azure or GCP.
- A **domain or subdomain**, e.g. `exams.yourcompany.com`.
- Optional: SMTP details (SendGrid, Amazon SES, Mailgun, Gmail Workspace…) to email invitations automatically.

## 1. Point your domain at the server

At your DNS provider, add an **A record**: `exams.yourcompany.com` → your server's public IP.
Wait until `ping exams.yourcompany.com` shows that IP.

## 2. Open the firewall

Allow these inbound ports (cloud firewall / security group **and** `ufw` if enabled):

| Port | Protocol | For |
|---|---|---|
| 80, 443 | TCP | Website and HTTPS certificates |
| 443 | UDP | HTTP/3 (optional) |
| 3478 | TCP + UDP | TURN relay |
| 49160–49200 | UDP | TURN relay media |

```bash
sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw allow 3478 && sudo ufw allow 49160:49200/udp
```

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # then log out and back in
```

## 4. Get the code and configure it

```bash
git clone https://github.com/Harsha77064/proctor-Replica.git oversee
cd oversee
cp .env.example .env
nano .env
```

Set at least:

- `DOMAIN` – your domain from step 1
- `ACME_EMAIL` – your email, for certificate expiry notices
- `TURN_SECRET` – a long random value: run `openssl rand -hex 32` and paste the output
- `SMTP_*` – optional, to email invitations

## 5. Start it

```bash
docker compose up -d --build
```

The first start takes a few minutes. Then open `https://your-domain`. You'll see
**Set up Oversee**: create your organization and the first admin account. Leave
"Load demo data" unticked for real use.

## 6. Run your first exam

1. **Question Bank**: create a bank and add questions.
2. **Dashboard**: add candidates.
3. **Exams**: schedule an exam, then assign candidates to it (Dashboard → Assign Exam).
4. **Exams → Invitations**: create links. Each candidate gets a personal link and an
   access code. With SMTP set up they're emailed; otherwise copy them and send them yourself.
5. At exam time click **Start Now**. Candidates open their link, enter their code, pass the
   camera check and start. Watch them under **Live Monitoring**.
6. Add proctors under **Users** (role: Proctor). They can monitor, record, warn and flag,
   but cannot change exams or see answer keys.

## Everyday operations

| Task | Command |
|---|---|
| See logs | `docker compose logs -f app` |
| Update to the latest code | `git pull && docker compose up -d --build` |
| Back up the database | `docker compose exec app node server/cli.js backup` |
| Reset a forgotten admin password | `docker compose exec app node server/cli.js reset-password --email you@x.com --password 'NewPassw0rd123'` |
| Stop everything | `docker compose down` (data is kept in Docker volumes) |

**Backups.** The database and recordings live in the `oversee-data` volume. Run the
backup command daily (e.g. from cron) and copy `/data/backups` and `/data/recordings`
off the server:

```bash
docker compose exec app node server/cli.js backup
docker run --rm -v oversee_oversee-data:/data -v "$PWD":/out alpine tar czf /out/oversee-data.tgz -C /data .
```

## Sizing notes

- Camera video goes **directly** between the candidate and the proctor's browser when the
  networks allow it, so the server's bandwidth stays low. When TURN relays a stream it uses
  roughly 0.5–1.5 Mbit/s per candidate per proctor watching.
- Recordings are stored on the server's disk (about 5–15 MB per minute). Watch free space
  with `df -h`; the limit per upload is `MAX_RECORDING_MB` (1 GB by default).
- SQLite comfortably handles hundreds of candidates at once on one server. Beyond that,
  move to PostgreSQL and object storage (S3) for recordings.

## Security checklist

- [x] HTTPS everywhere (Caddy), HSTS, strict Content-Security-Policy
- [x] Passwords hashed with scrypt; sign-in rate limited; sessions in HttpOnly, Secure, SameSite cookies
- [x] Admin vs proctor roles enforced on the server; proctors never receive answer keys
- [x] Candidates sign in with a personal link + access code; 5 wrong codes lock the invitation
- [x] Questions are sent without answers; timing and scoring happen on the server
- [x] Recordings only downloadable by signed-in staff
- [x] TURN relay uses short-lived credentials and refuses to relay into private networks
- [ ] Keep the server updated: `sudo apt update && sudo apt upgrade`
- [ ] Schedule backups and test restoring one
- [ ] Tell candidates how their recordings are stored and for how long (privacy laws such as GDPR / DPDP may require this)
