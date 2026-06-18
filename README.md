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

For `NEWAPI_COOKIE`, log in to your `new-api` dashboard as an admin, copy the dashboard request Cookie header, and paste the full cookie string.

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

## Safety Model

The first version is read-only. It may produce proposed actions, but it will not execute them.

Future execution should be limited by policy:

- allow low-risk actions only;
- require manual confirmation for creating, deleting, repricing, or regrouping channels;
- write an audit record for every action;
- keep Discord reports separate from execution approval.
