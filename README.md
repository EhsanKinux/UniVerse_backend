# uni-verse backend

Backend API for the **uni-verse** university PWA, built with **NestJS 11**, **Prisma 7**, and **PostgreSQL 17**.

It provides JWT authentication (access + refresh tokens), a set of public read APIs that power the student app, per-student features (weekly schedule, profile), real-time notifications (SSE + Web Push), and a **server-rendered admin panel** at `/admin` that university staff use to manage content — no code changes per term.

- **Interactive API docs (Swagger):** `http://<host>:<port>/docs`
- **Admin panel:** `http://<host>:<port>/admin`
- Default port: **3001** (chosen so it doesn't clash with the Next.js frontend on 3000)

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [API overview](#api-overview)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Deploying to an Ubuntu 24.04 server](#deploying-to-an-ubuntu-2404-server)
  - [1. Prepare the server](#1-prepare-the-server)
  - [2. Install Node.js](#2-install-nodejs-lts)
  - [3. Get the code](#3-get-the-code)
  - [4. Set up PostgreSQL](#4-set-up-postgresql)
  - [5. Configure environment variables](#5-configure-environment-variables)
  - [6. Install, build, migrate](#6-install-dependencies-build-and-migrate)
  - [7. Run as a systemd service](#7-run-as-a-systemd-service)
  - [8. Expose the API](#8-expose-the-api)
  - [9. Updating the deployment](#9-updating-a-running-deployment)
- [Production checklist](#production-checklist)
- [Useful scripts](#useful-scripts)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)

---

## Features

| Module | Persian name | What it does |
| ------ | ------------ | ------------ |
| **Auth** | — | Register / login / refresh / logout / delete account. Access + refresh JWTs with rotation. |
| **Profile** | اطلاعات حساب کاربری | Per-student profile (personal + academic fields), completion points, avatar upload. |
| **Weekly schedule** | برنامه هفتگی | Per-student timetable (courses + sessions) with odd/even week parity and **class push reminders** (a cron job). |
| **Academic calendar** | تقویم آموزشی | Staff-managed semester events; public API returns them pre-formatted (Jalali labels, status, countdown). |
| **Documents** | اسناد و فایل‌ها | Generic staff-managed file library (e.g. the «دروس ارائه‌شده» PDF). One active file per category + an archive. |
| **Educational chart** | چارت آموزشی | Curriculum roadmap PDFs grouped by department. |
| **News / announcements** | اخبار و اطلاعیه‌ها | Staff post news; students see it, get **real-time SSE** updates and **Web Push** OS notifications. |
| **Web Push** | — | VAPID-based browser/OS push (optional; disabled gracefully if no keys). |
| **Admin panel** | پنل مدیریت | Server-rendered (Handlebars) staff UI at `/admin`, protected by a single shared login. Manages all content above. |

All dates are handled in the Iranian (Jalali) calendar and the `Asia/Tehran` timezone.

---

## Tech stack

| Concern         | Choice                                                             |
| --------------- | ----------------------------------------------------------------- |
| Runtime         | Node.js 20+ (22 LTS recommended)                                  |
| Framework       | NestJS 11                                                          |
| Database        | PostgreSQL 17 (Docker Compose) or 16 (Ubuntu apt) — both work     |
| ORM             | Prisma 7 with the `@prisma/adapter-pg` driver adapter (pure-JS, no separate engine binary) |
| Auth            | JWT access + refresh tokens (rotation + logout); passwords via bcrypt, refresh tokens stored as SHA-256 hashes |
| Validation      | `class-validator` via a global `ValidationPipe`                   |
| Real-time       | Server-Sent Events (`@nestjs/sse`) + Web Push (`web-push`, VAPID) |
| Scheduled jobs  | `@nestjs/schedule` (per-minute class-reminder cron)               |
| File uploads    | Multer → files on disk in `uploads/`, metadata in Postgres        |
| Admin UI        | Server-rendered Handlebars (`hbs`) views + `express-session`      |
| API docs        | Swagger / OpenAPI at `/docs`                                      |

---

## API overview

Full interactive documentation lives at **`/docs`** (Swagger). Public JSON endpoints, grouped by module:

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/` | — | Health check |
| POST | `/auth/register` | — | Create account → token pair |
| POST | `/auth/login` | — | Log in → token pair |
| POST | `/auth/refresh` | Bearer **refresh** | Rotate the refresh token → new pair |
| POST | `/auth/logout` | Bearer **access** | Revoke the refresh token |
| GET | `/auth/me` | Bearer **access** | Current user |
| DELETE | `/auth/me` | Bearer **access** | Delete account (requires password) |
| GET | `/profile` | Bearer **access** | Current user's profile + points |
| PATCH | `/profile` | Bearer **access** | Update profile fields |
| POST/DELETE | `/profile/avatar` | Bearer **access** | Set / clear avatar |
| GET | `/profile/:userId/avatar` | — | Stream a user's avatar image |
| GET | `/schedule` | Bearer **access** | The student's timetable + settings |
| POST/PATCH/DELETE | `/schedule/courses[/:id]` | Bearer **access** | Manage courses (+ their sessions) |
| PATCH | `/schedule/settings` | Bearer **access** | Reminder + week-parity preferences |
| GET | `/calendar/active` | — | Active semester + pre-formatted events |
| GET | `/documents/:category` | — | Active file + archive for a category |
| GET | `/documents/file/:id` | — | Stream a document (`?download=1` → attachment) |
| GET | `/chart` | — | Departments + their chart files |
| GET | `/chart/file/:id` | — | Stream a chart PDF |
| GET | `/news` | — | Published news (pinned first) |
| GET | `/news/stream` | — | **SSE** stream of live news events |
| GET | `/news/:id` | — | A single news item |
| GET | `/news/:id/cover` | — | Stream a news cover image |
| GET | `/news/file/:id` | — | Stream a news attachment |
| GET | `/push/public-key` | — | The VAPID public key |
| POST | `/push/subscribe` | Optional **access** | Register a browser push subscription |
| POST | `/push/unsubscribe` | — | Remove a push subscription |

**Admin panel** (server-rendered, session-gated) is served under `/admin` — dashboard, `/admin/documents`, `/admin/news`, `/admin/chart`, `/admin/users`, plus semester/event editing. Log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

---

## Environment variables

Copy `.env.example` to `.env` and fill in real values. The app **validates these at startup** (`src/config/env.validation.ts`) and refuses to boot with a clear message if a required one is missing or malformed.

| Variable | Required | Default | Description |
| -------- | :------: | ------- | ----------- |
| `PORT` | no | `3001` | Port the API listens on |
| `CORS_ORIGIN` | no | allow-all | Comma-separated allowed origins (set to your frontend URL in prod) |
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | **yes** | — | Secret for signing access tokens |
| `JWT_ACCESS_EXPIRES_IN` | **yes** | `15m` | Access-token lifetime |
| `JWT_REFRESH_SECRET` | **yes** | — | Secret for signing refresh tokens (must differ from access) |
| `JWT_REFRESH_EXPIRES_IN` | **yes** | `7d` | Refresh-token lifetime |
| `ADMIN_USERNAME` | **yes** | — | Admin-panel login username |
| `ADMIN_PASSWORD` | **yes** | — | Admin-panel login password |
| `SESSION_SECRET` | **yes** | — | Signs the admin session cookie |
| `UPLOAD_DIR` | no | `uploads` | Folder for uploaded files (relative to project root) |
| `MAX_UPLOAD_MB` | no | `20` | Per-file upload size cap (MB) |
| `MAX_AVATAR_MB` | no | `5` | Per-file avatar size cap (MB) |
| `VAPID_PUBLIC_KEY` | no | — | Web Push public key (push disabled if unset) |
| `VAPID_PRIVATE_KEY` | no | — | Web Push private key |
| `VAPID_SUBJECT` | no | — | Contact URI, e.g. `mailto:admin@example.com` |

Generate strong secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Generate a VAPID key pair (only if you want OS push notifications):

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

---

## Local development

**Prerequisites:** Node.js 20+ and npm, plus Docker Desktop (to run PostgreSQL locally).

```bash
# 1. Install dependencies (postinstall also generates the Prisma client)
npm install

# 2. Create your env file from the template, then edit the values
cp .env.example .env          # macOS/Linux
# Copy-Item .env.example .env  # Windows PowerShell

# 3. Start PostgreSQL in Docker
npm run db:up

# 4. Create the database tables
npm run prisma:migrate

# 5. (Optional) seed the calendar + chart departments with realistic data
npm run db:seed

# 6. Start the API in watch mode
npm run start:dev
```

The API runs at **http://localhost:3001**, Swagger at **/docs**, admin at **/admin**.

---

## Deploying to an Ubuntu 24.04 server

This walkthrough gets the API running as a production service on a fresh **Ubuntu 24.04 LTS** machine. It covers **two database options** (Docker Compose or a native `apt` install) and **two ways to expose the API** (plain HTTP, or Nginx + HTTPS). Pick the option that fits you at each step.

> **Architecture:** the API is a Node process managed by **systemd** (auto-restart, starts on boot). It talks to PostgreSQL on `localhost`. Optionally, **Nginx** sits in front to terminate HTTPS and proxy to the Node process.

### 1. Prepare the server

Update packages and create an unprivileged user to own and run the app (running services as `root` is bad practice):

```bash
sudo apt update && sudo apt upgrade -y

# A dedicated system user with no login shell, to own and run the app
sudo adduser --system --group --home /opt/univers-backend univers
```

Enable the firewall (allow SSH so you don't lock yourself out):

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw enable
```

We'll open the app/web ports later in [step 8](#8-expose-the-api).

### 2. Install Node.js (LTS)

Ubuntu's default Node is old; install the current LTS from NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node -v   # should print v22.x
npm -v
```

### 3. Get the code

Clone the repository into the app directory and hand ownership to the `univers` user:

```bash
sudo apt install -y git
sudo git clone <YOUR_REPO_URL> /opt/univers-backend
sudo chown -R univers:univers /opt/univers-backend
cd /opt/univers-backend
```

### 4. Set up PostgreSQL

Choose **one** of the two options below.

#### Option A — PostgreSQL via Docker Compose (matches dev exactly)

Install Docker Engine + the Compose plugin:

```bash
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
```

The bundled `docker-compose.yml` runs Postgres 17. **Before starting it in production**, harden it:

1. **Change the password.** Edit `docker-compose.yml` and set a strong `POSTGRES_PASSWORD` (it must match `DATABASE_URL` in your `.env`).
2. **Don't expose the DB publicly.** Bind the port to localhost only — change the `ports` mapping from `'5432:5432'` to:

   ```yaml
       ports:
         - '127.0.0.1:5432:5432'
   ```

Then start it (it restarts automatically on reboot via `restart: unless-stopped`):

```bash
sudo docker compose up -d
sudo docker compose ps          # check it's healthy
```

Your `DATABASE_URL` will point at `localhost:5432` — see [step 5](#5-configure-environment-variables).

#### Option B — Native PostgreSQL via apt

Ubuntu 24.04 ships **PostgreSQL 16**, which is fully compatible with this project (the dev setup uses 17, but the schema uses nothing version-specific). Install it:

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Create the database and a dedicated role (use a strong password):

```bash
sudo -u postgres psql <<'SQL'
CREATE USER univers WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE univers OWNER univers;
GRANT ALL PRIVILEGES ON DATABASE univers TO univers;
SQL
```

> Want to match dev's Postgres 17 exactly instead? Add the official PGDG repo before installing:
> ```bash
> sudo apt install -y curl ca-certificates
> sudo install -d /usr/share/postgresql-common/pgdg
> sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
>   https://www.postgresql.org/media/keys/ACCC4CF8.asc
> echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
>   https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | \
>   sudo tee /etc/apt/sources.list.d/pgdg.list
> sudo apt update && sudo apt install -y postgresql-17
> ```

### 5. Configure environment variables

Create the production `.env` from the template and edit it:

```bash
sudo -u univers cp .env.example .env
sudo -u univers nano .env
```

Set at minimum:

```dotenv
PORT=3001

# Only your production frontend origin(s), comma-separated. NOT a wildcard.
CORS_ORIGIN=https://your-frontend-domain.com

# Match whichever DB option you chose in step 4:
DATABASE_URL="postgresql://univers:YOUR_DB_PASSWORD@localhost:5432/univers?schema=public"

# Generate each with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_ACCESS_SECRET="..."
JWT_REFRESH_SECRET="..."
SESSION_SECRET="..."

# Change these from the defaults!
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="a-strong-admin-password"

# Optional: enable OS push notifications
# node -e "console.log(require('web-push').generateVAPIDKeys())"
VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."
VAPID_SUBJECT="mailto:admin@your-domain.com"
```

> `.env` is git-ignored and holds secrets. Keep it owned by `univers` and readable only by that user: `sudo chmod 600 /opt/univers-backend/.env`.

### 6. Install dependencies, build, and migrate

Run these **as the `univers` user** so file ownership stays correct:

```bash
cd /opt/univers-backend

# Install exactly the locked dependencies (postinstall also runs `prisma generate`)
sudo -u univers npm ci

# Apply all migrations to the production database (never use `migrate dev` in prod)
sudo -u univers npx prisma migrate deploy

# (Optional) seed the calendar + chart departments with starter data
sudo -u univers npm run db:seed

# Compile TypeScript to dist/
sudo -u univers npm run build
```

> `prisma migrate deploy` applies existing migrations without generating new ones — the correct command for production. The Prisma client is generated automatically by the `postinstall` hook and compiled into `dist/`, so there's no separate engine binary to install.

Quick smoke test before wiring up systemd:

```bash
sudo -u univers node dist/main
# In another shell: curl http://localhost:3001/
# Ctrl-C to stop, then continue.
```

### 7. Run as a systemd service

systemd keeps the API running, restarts it if it crashes, and starts it on boot. Create the unit file:

```bash
sudo nano /etc/systemd/system/univers-backend.service
```

```ini
[Unit]
Description=uni-verse backend (NestJS API)
# If you used Docker for Postgres, wait for Docker; otherwise wait for postgresql.
After=network.target docker.service postgresql.service
Wants=network.target

[Service]
Type=simple
User=univers
Group=univers
# WorkingDirectory MUST be the project root: the app resolves `views/`, `uploads/`,
# and the Handlebars partials relative to this directory (process.cwd()).
WorkingDirectory=/opt/univers-backend
EnvironmentFile=/opt/univers-backend/.env
ExecStart=/usr/bin/node dist/main
Restart=always
RestartSec=5
# Basic hardening
NoNewPrivileges=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now univers-backend

# Check status and follow logs
sudo systemctl status univers-backend
sudo journalctl -u univers-backend -f
```

You should see the `🚀 uni-verse API running` log line.

### 8. Expose the API

Choose **one** of the two options.

#### Option A — Plain HTTP (simplest)

Open the app port in the firewall and you're done:

```bash
sudo ufw allow 3001/tcp
```

The API is reachable at `http://<server-ip>:3001`.

> ⚠️ **No HTTPS.** The PWA's **Web Push and service worker require a secure context (HTTPS)** on a real domain, so OS push notifications will *not* work over plain HTTP. Use this only for a quick internal demo, or on `localhost`. For anything public, use Option B.

#### Option B — Nginx reverse proxy + HTTPS (recommended)

Nginx terminates TLS and forwards requests to the Node process on `localhost:3001`. Keep the app port **closed** to the outside and open only 80/443:

```bash
sudo apt install -y nginx
sudo ufw allow 'Nginx Full'   # opens 80 + 443
# do NOT `ufw allow 3001` — Nginx reaches it over localhost
```

Create a site config (replace `api.your-domain.com` with your domain, pointed at this server via a DNS A record):

```bash
sudo nano /etc/nginx/sites-available/univers-backend
```

```nginx
server {
    listen 80;
    server_name api.your-domain.com;

    # Allow the largest uploads the API accepts (keep in sync with MAX_UPLOAD_MB).
    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for the /news/stream Server-Sent Events endpoint:
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }
}
```

Enable it and reload:

```bash
sudo ln -s /etc/nginx/sites-available/univers-backend /etc/nginx/sites-enabled/
sudo nginx -t          # test the config
sudo systemctl reload nginx
```

Add free HTTPS with Let's Encrypt (certbot edits the config and sets up auto-renewal for you):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.your-domain.com
```

The API is now at `https://api.your-domain.com` (Swagger at `/docs`, admin at `/admin`). Remember to set `CORS_ORIGIN` to your frontend's HTTPS origin.

### 9. Updating a running deployment

To deploy new code:

```bash
cd /opt/univers-backend
sudo -u univers git pull
sudo -u univers npm ci
sudo -u univers npx prisma migrate deploy   # apply any new migrations
sudo -u univers npm run build
sudo systemctl restart univers-backend
```

---

## Production checklist

- [ ] All secrets (`JWT_*`, `SESSION_SECRET`, `ADMIN_PASSWORD`, DB password) changed from the examples and randomly generated.
- [ ] `CORS_ORIGIN` set to your real frontend origin(s) — not a wildcard.
- [ ] `.env` permissions locked down (`chmod 600`, owned by the service user).
- [ ] Database **not** exposed to the public internet (bound to `127.0.0.1`).
- [ ] HTTPS in front (Option B) — required for Web Push and PWA install.
- [ ] **`uploads/` persistence:** uploaded files live on disk here (only metadata is in Postgres). It survives redeploys as long as you don't delete the folder. Include it in backups.
- [ ] **Backups:** schedule regular `pg_dump` (or a `docker exec … pg_dump`) of the database **and** archive the `uploads/` folder.
- [ ] VAPID keys set if you want OS push notifications; otherwise push is disabled gracefully (in-app SSE notifications still work).

---

## Useful scripts

| Script | What it does |
| ------ | ------------ |
| `npm run start:dev` | Run the API with hot-reload (development) |
| `npm run start:prod` | Run the compiled build (`node dist/main`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run db:up` / `db:down` | Start / stop the PostgreSQL container (Docker) |
| `npm run prisma:migrate` | Create & apply a migration (**dev only**) |
| `npx prisma migrate deploy` | Apply existing migrations (**production**) |
| `npm run prisma:studio` | Open Prisma Studio (visual DB browser) |
| `npm run db:seed` | Seed the calendar + chart departments with starter data |
| `npm test` | Run unit tests |

---

## Troubleshooting

| Symptom | Likely cause / fix |
| ------- | ------------------ |
| App exits at startup with *"Invalid environment variables"* | A required var in `.env` is missing/malformed. The message lists which one. |
| `Can't reach database server` | Wrong `DATABASE_URL`, Postgres not running, or (native install) password auth not configured. Check `sudo systemctl status postgresql` / `sudo docker compose ps`. |
| Admin panel shows *"partial … could not be found"* | The service `WorkingDirectory` isn't the project root — the app resolves `views/` relative to `process.cwd()`. Fix the systemd unit. |
| Uploads fail with a permission error | The `uploads/` folder isn't writable by the service user. `sudo chown -R univers:univers /opt/univers-backend/uploads`. |
| `/news/stream` disconnects immediately behind Nginx | Add the SSE proxy settings shown in step 8B (`proxy_buffering off`, long `proxy_read_timeout`, `Connection ''`). |
| Web Push does nothing | Needs HTTPS on a real domain **and** VAPID keys set. In-app SSE notifications work without either. |
| Logs | `sudo journalctl -u univers-backend -f` (app) and `sudo docker compose logs -f db` or `sudo journalctl -u postgresql` (database). |

---

## Project structure

```
src/
├── main.ts               # bootstrap: session, hbs views, global validation, CORS, Swagger
├── app.module.ts         # root module — imports every feature module
├── config/               # environment-variable validation
├── prisma/               # PrismaService (DB gateway) + global module
├── common/               # shared guards/decorators/utilities
├── auth/                 # register / login / refresh / logout / delete + JWT strategies & guards
├── users/                # user records (DB access)
├── profile/              # student-owned profile + avatar
├── schedule/             # weekly timetable + class-reminder cron
├── calendar/             # academic calendar (public read)
├── documents/            # staff-managed file library (public read)
├── chart/                # educational chart PDFs (public read)
├── news/                 # news + SSE stream (public read)
├── push/                 # Web Push (VAPID) subscriptions
└── admin/                # server-rendered staff panel controllers
prisma/
├── schema.prisma         # the data model
├── migrations/           # versioned SQL migrations (apply with `migrate deploy`)
└── seed.ts               # optional starter data
views/                    # Handlebars templates for the /admin panel
uploads/                  # uploaded files on disk (git-ignored; back this up)
docker-compose.yml        # PostgreSQL 17 for local dev / Docker deploys
```

---

Part of the **uni-verse** final project. Frontend: the Next.js PWA (separate repository).
