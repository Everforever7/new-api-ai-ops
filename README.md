# new-api-ai-ops

Sidecar AI operations assistant for `new-api`.

This project stays outside the main `new-api` repository. It reads status from `new-api`, asks an OpenAI-compatible model for an operations report, and optionally sends the report to Discord.

## First Milestone

- Collect channels from `/api/channel`.
- Collect recent common logs from `/api/log`.
- Collect recent log stats from `/api/log/stat`.
- Build a health snapshot.
- Generate a Chinese Markdown report with an LLM.
- Send the report to Discord through a webhook.
- Save local report copies under `reports/`.
- Expose a lightweight Basic Auth management panel.
- Do not modify channels automatically.

## Setup

```bash
cd E:\new-api-ai-ops
bun install
copy .env.example .env
```

Then edit `.env`.

For local testing, `NEWAPI_COOKIE` is the most reliable option: log in to your
`new-api` dashboard as an admin, copy the dashboard request Cookie header, and
paste the full cookie string.

For Docker deployment, you can use `NEWAPI_USERNAME` and `NEWAPI_PASSWORD`
instead. The sidecar logs in through `/api/user/login` and keeps the session
cookie in memory. It also reads the login response user id and sends it as the
`New-Api-User` header required by new-api admin APIs.

If Turnstile or 2FA blocks dashboard login, use `NEWAPI_COOKIE` instead. Cookie
or direct authorization mode also needs `NEWAPI_USER_HEADER`, usually the admin
user id, for example `1`.

For `LLM_BASE_URL`, you can point it to your own `new-api` endpoint:

```env
LLM_BASE_URL=https://your-new-api.example.com/v1
LLM_API_KEY=sk-...
```

## Run Once

```bash
bun run once
```

Dry-run skips Discord sending and prints the report:

```bash
bun run dry-run
```

## Run As A Loop

```bash
bun run start
```

The interval is controlled by `REPORT_INTERVAL_MINUTES`.

## Management Panel

The sidecar includes a lightweight web panel on port `8787`.

Set a password before exposing it:

```env
PANEL_ENABLED=true
PANEL_HOST=0.0.0.0
PANEL_PORT=8787
PANEL_USERNAME=admin
PANEL_PASSWORD=change-this-password
```

Run the panel without the scheduler for local checks:

```bash
bun run panel
```

Run the panel API and Vue frontend together during development:

```bash
bun run dev
```

The Vue dev server runs on `5173` by default and proxies `/api/*` to the Bun
panel server on `8787`. You can override them with `WEB_PORT` and `PANEL_PORT`.

Build the Vue frontend before packaging or production static serving:

```bash
bun run build
```

In normal Docker mode, `bun run start` starts both the scheduler and the panel.

Panel capabilities in the first version:

- view sidecar status;
- run a manual check without sending Discord by default;
- view the latest report;
- view a sanitized channel snapshot.

## Docker Image

GitHub Actions publishes the image to GHCR when `main` is pushed:

```text
ghcr.io/everforever7/new-api-ai-ops:latest
```

Manual releases can also be started from the repository's Actions tab through
`Publish Docker image`.

## Docker Compose

The sidecar can run in the same compose stack as `new-api`.

Use internal service URLs:

```env
NEWAPI_BASE_URL=http://new-api:3000
LLM_BASE_URL=http://new-api:3000/v1
```

Example service:

```yaml
  new-api-ai-ops:
    image: ghcr.io/everforever7/new-api-ai-ops:latest
    container_name: new-api-ai-ops
    restart: always
    depends_on:
      - new-api
    environment:
      NEWAPI_BASE_URL: "http://new-api:3000"
      NEWAPI_USERNAME: "${NEWAPI_ADMIN_USERNAME}"
      NEWAPI_PASSWORD: "${NEWAPI_ADMIN_PASSWORD}"
      NEWAPI_USER_HEADER: "${NEWAPI_USER_HEADER:-}"
      LLM_BASE_URL: "http://new-api:3000/v1"
      LLM_API_KEY: "${AI_OPS_LLM_API_KEY}"
      DISCORD_WEBHOOK_URL: "${AI_OPS_DISCORD_WEBHOOK_URL}"
      REPORT_INTERVAL_MINUTES: "15"
      AUTO_EXECUTE: "false"
      PANEL_ENABLED: "true"
      PANEL_USERNAME: "${AI_OPS_PANEL_USERNAME:-admin}"
      PANEL_PASSWORD: "${AI_OPS_PANEL_PASSWORD}"
      TZ: "${TZ}"
    ports:
      - "8787:8787"
    volumes:
      - /mnt/Save/apps/new-api/ai_ops_reports:/app/reports
    networks: [newapi-net]
```

If you use Cloudflare Tunnel, you can remove `ports:` and route a public
hostname to:

```text
http://new-api-ai-ops:8787
```

`http://new-api-ai-ops:8787` is an internal Docker service address. It works
from other containers on the same compose network, such as Cloudflare Tunnel,
but it is not a public browser URL by itself. Public access still needs a real
domain routed by Cloudflare Tunnel, Nginx, or another reverse proxy.

## Safety Model

The first version is read-only. It may produce proposed actions, but it will not execute them.

Future execution should be limited by policy:

- allow low-risk actions only;
- require manual confirmation for creating, deleting, repricing, or regrouping channels;
- write an audit record for every action;
- keep Discord reports separate from execution approval.
