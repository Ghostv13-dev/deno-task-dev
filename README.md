# Telegram-Bot — Production Build

A Deno/V8-based Telegram business management, communication, and automation
system, implementing the owner/users/groups model described in the system
overview: publishing, editable buttons, scheduling, destination management,
access control, and group-mention assistance.

## Stack

- **Runtime:** Deno (webhook server via `Deno.serve`, background jobs via `Deno.cron`)
- **Telegram framework:** [grammY](https://grammy.dev)
- **Storage:** hybrid —
  - **SQLite** (via Deno's built-in `node:sqlite`, no external dependency) for all durable data: destinations, published posts, the button→post index, scheduled posts, access requests.
  - **Deno KV** for short-lived conversation/wizard state only (auto-expires after 30 minutes of inactivity via `expireIn`).
- **Hosting:** self-hosted (VPS, Docker, Fly.io/Railway with a persistent volume) — **not** Deno Deploy's classic model, since SQLite needs a persistent writable file and that platform's filesystem is ephemeral per-isolate. If you later want Deno Deploy, swap the SQLite calls in `src/db.ts` for Deno KV-only (as in the previous version) or a managed Postgres.

## Project layout

```
telegram-bot/
├── main.ts                     # webhook server + cron entry point
├── deno.json                   # tasks + import map
├── Dockerfile                  # self-hosted container build
├── docker-compose.yml          # container + persistent volume for the DB
├── .env.example                # required environment variables
├── data/                       # SQLite file lives here at runtime (gitignore this)
├── scripts/set_webhook.ts      # one-time webhook registration
└── src/
    ├── config.ts                # env var loading
    ├── types.ts                 # domain types
    ├── db.ts                    # SQLite (durable) + Deno KV (conversation state)
    ├── bot.ts                   # command/message routing
    ├── middleware/auth.ts       # owner-only / approved-only gates
    └── features/
        ├── destinations.ts      # connect/list/remove channels & groups
        ├── publish.ts           # multi-destination publish + wizard
        ├── buttons.ts           # update a button's URL across old posts
        ├── scheduling.ts        # /schedule + cron-driven publication
        ├── access.ts            # request/approve/decline access
        ├── groupMention.ts      # respond only when @mentioned in groups
        └── assistance.ts        # simple FAQ-style business assistance
```

## Setup

1. **Create the bot** with [@BotFather](https://t.me/BotFather) and copy the token.
2. **Get your Telegram user id** from [@userinfobot](https://t.me/userinfobot) — this becomes `OWNER_ID`.
3. Copy `.env.example` to `.env` and fill in `BOT_TOKEN`, `OWNER_ID`, a random `WEBHOOK_SECRET`, `PUBLIC_URL` (your domain, set once you have one), and `DB_PATH` (defaults to `./data/bot.db`, or `/app/data/bot.db` in Docker).
4. Requires **Deno 2.2+** (ships `node:sqlite` natively). Check with `deno --version`; upgrade with `deno upgrade` if needed.

## Local development

```
deno task setwebhook   # after PUBLIC_URL is reachable, e.g. via ngrok/cloudflared tunnel
deno task dev
```

The first run creates `data/bot.db` and its tables automatically.

## Deploying (self-hosted, recommended)

**Docker Compose** (simplest — persists the DB in a named volume):

```
docker compose up -d --build
```

Then point `PUBLIC_URL` at wherever this container is reachable (behind a reverse proxy like Caddy/nginx with HTTPS — Telegram requires HTTPS webhooks) and run `deno task setwebhook` once.

**Bare VPS / systemd:** install Deno, clone the repo, put a persistent path in `DB_PATH`, and run `deno task start` under a systemd service (or `pm2`/`supervisord`) so it restarts on crash/reboot. Put it behind a reverse proxy for TLS.

**Fly.io / Railway:** deploy the Dockerfile and attach a persistent volume mounted at `/app/data`; both platforms support this directly.

## Using the bot

**Owner commands** (only work for the Telegram account matching `OWNER_ID`):

| Command | Purpose |
|---|---|
| `/adddestination <label>` | Run inside a channel/group to connect it |
| `/listdestinations` | List connected destinations and their ids |
| `/removedestination <id>` | Disconnect a destination |
| `/publish` | Start the guided publish flow (text → buttons → destinations) |
| `/schedule <when> \| <dest ids> \| <text>` | Schedule a post, e.g. `/schedule 2026-09-10T10:00 \| main-channel,promo \| Big sale tomorrow!` |
| `/changebutton <buttonId> <newUrl>` | Update a button's destination across every post that used it |
| `/requests` | Review and approve/decline pending access requests |

**User commands:**

| Command | Purpose |
|---|---|
| `/start` | Greeting and basic guidance |
| `/requestaccess` | Ask the owner for approval to use gated features |
| plain text | Answered by the FAQ-style business assistance handler |

**Groups:** the bot only responds when explicitly mentioned, e.g. `@YourBot price of Product A?`.

## Extending

- **Business assistance:** `src/features/assistance.ts` has a small keyword-matched FAQ table — swap the `answerBusinessQuestion` function for an LLM call or CMS lookup as needed.
- **Gated features for approved users:** wrap any handler with the `approvedOnly` middleware from `src/middleware/auth.ts`.
- **Storage:** all persistence goes through `src/db.ts`; replace its internals to move off Deno KV without touching feature code.

## Data retention

Following the privacy principle in the system overview, only functionally
necessary data is stored permanently — in SQLite: destinations, published
posts + button index, schedules, access decisions. In-progress conversation
state (the publish wizard) lives in Deno KV with a 30-minute TTL and expires
automatically if abandoned, rather than accumulating as a permanent record
of every conversation.
