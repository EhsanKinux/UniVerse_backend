# uni-verse backend

Backend API for the **uni-verse** PWA, built with **NestJS 11**, **Prisma 7**, and **PostgreSQL**.
Provides JWT authentication (access + refresh tokens) and interactive Swagger docs.

## Tech stack

| Concern        | Choice                                            |
| -------------- | ------------------------------------------------- |
| Framework      | NestJS 11                                         |
| Database       | PostgreSQL 17 (via Docker Compose)                |
| ORM            | Prisma 7 (with the `@prisma/adapter-pg` driver)   |
| Auth           | JWT access + refresh tokens, rotation + logout    |
| Passwords      | bcrypt (`bcryptjs`)                               |
| Validation     | `class-validator` via a global `ValidationPipe`   |
| API docs       | Swagger / OpenAPI at `/docs`                      |

## Prerequisites

- Node.js 20+ and npm
- Docker Desktop (to run PostgreSQL)

## Getting started

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Create your local env file from the template, then review the values
cp .env.example .env        # macOS/Linux
# Copy-Item .env.example .env  # Windows PowerShell

# 3. Start PostgreSQL in Docker
npm run db:up

# 4. Create the database tables
npm run prisma:migrate

# 5. Start the API in watch mode
npm run start:dev
```

The API runs at **http://localhost:3001** and Swagger docs at **http://localhost:3001/docs**.
(Port 3001 is used so it doesn't clash with the Next.js dev server on 3000.)

## Useful scripts

| Script                    | What it does                                  |
| ------------------------- | --------------------------------------------- |
| `npm run start:dev`       | Run the API with hot-reload                   |
| `npm run build`           | Compile to `dist/`                            |
| `npm run db:up` / `db:down` | Start / stop the PostgreSQL container       |
| `npm run prisma:migrate`  | Create & apply a migration (dev)              |
| `npm run prisma:studio`   | Open Prisma Studio (visual DB browser)        |
| `npm test`                | Run unit tests                                |

## API endpoints

| Method | Path             | Auth                | Description                          |
| ------ | ---------------- | ------------------- | ------------------------------------ |
| GET    | `/`              | —                   | Health check                         |
| POST   | `/auth/register` | —                   | Create account, returns token pair   |
| POST   | `/auth/login`    | —                   | Log in, returns token pair           |
| POST   | `/auth/refresh`  | Bearer **refresh**  | Exchange refresh token for new pair  |
| POST   | `/auth/logout`   | Bearer **access**   | Revoke the refresh token             |
| GET    | `/auth/me`       | Bearer **access**   | Get the current user                 |

### Auth flow

1. **Register / Login** → receive `accessToken` (short-lived) + `refreshToken` (long-lived).
2. Send `Authorization: Bearer <accessToken>` on protected requests.
3. When the access token expires, call **`/auth/refresh`** with the refresh token to get a new pair (the old refresh token is rotated out and invalidated).
4. **`/auth/logout`** clears the stored refresh token so it can no longer be used.

Refresh tokens are stored only as a **SHA-256 hash** in the database (never in plain text), and passwords only as a **bcrypt hash**.

## Project structure

```
src/
├── main.ts              # bootstrap: global validation, CORS, Swagger
├── app.module.ts        # root module
├── config/              # environment-variable validation
├── prisma/              # PrismaService (DB gateway) + global module
├── users/              # UsersService (DB access for users)
└── auth/                # controller, service, DTOs, JWT strategies, guards
prisma/
├── schema.prisma        # data model (the User table)
└── migrations/          # versioned SQL migrations
```

## Notes for the frontend

- All auth responses include `{ accessToken, refreshToken, user }`.
- For a PWA, prefer storing tokens in **httpOnly cookies** over `localStorage` where possible (reduces XSS risk). The current API returns tokens in the JSON body; cookie-based delivery can be added later.
- CORS is restricted to `CORS_ORIGIN` from `.env` (defaults to `http://localhost:3000`).
