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
cookie in memory. If Turnstile or 2FA blocks dashboard login, use
`NEWAPI_COOKIE` instead.

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
      LLM_BASE_URL: "http://new-api:3000/v1"
      LLM_API_KEY: "${AI_OPS_LLM_API_KEY}"
      DISCORD_WEBHOOK_URL: "${AI_OPS_DISCORD_WEBHOOK_URL}"
      REPORT_INTERVAL_MINUTES: "15"
      AUTO_EXECUTE: "false"
      TZ: "${TZ}"
    volumes:
      - /mnt/Save/apps/new-api/ai_ops_reports:/app/reports
    networks: [newapi-net]
```

## Safety Model

The first version is read-only. It may produce proposed actions, but it will not execute them.

Future execution should be limited by policy:

- allow low-risk actions only;
- require manual confirmation for creating, deleting, repricing, or regrouping channels;
- write an audit record for every action;
- keep Discord reports separate from execution approval.
