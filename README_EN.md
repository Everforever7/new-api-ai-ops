<div align="center">

# 🤖 New API AI Ops

**Sidecar AI Operations Assistant for [new-api](https://github.com/Calcium-Ion/new-api)**

[![Docker Image](https://img.shields.io/badge/GHCR-ghcr.io/everforever7/new--api--ai--ops-blue?logo=docker)](https://ghcr.io/everforever7/new-api-ai-ops)
[![Bun](https://img.shields.io/badge/Runtime-Bun-f9f1e1?logo=bun)](https://bun.sh)
[![Vue 3](https://img.shields.io/badge/Frontend-Vue%203-4FC08D?logo=vuedotjs)](https://vuejs.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

English | [简体中文](./README.md)

</div>

---

## 📖 Introduction

New API AI Ops is a standalone sidecar operations assistant designed for `new-api`. It collects channel status and call logs from `new-api`'s management APIs, leverages an OpenAI-compatible LLM to generate automated operations inspection reports, and can optionally push reports to a Discord webhook.

> **The current version supports controlled AI execution** — AI can propose actions, while actual execution is gated by panel permissions, confirmation strategies, protected channel rules, and audit logs.

## ✨ Features

- 📊 **Auto Collection** — Collects channel and log data from `/api/channel`, `/api/log`, `/api/log/stat`
- 🧠 **AI Analysis** — Calls LLM to generate Markdown operations inspection reports
- 💬 **Discord Push** — Automatically sends reports to Discord channels via webhook
- 💾 **Report Archive** — All reports are automatically saved to the `reports/` directory
- 🖥️ **Management Panel** — Built-in lightweight web management panel (Basic Auth)
- 🧩 **Action Queue** — Converts AI proposals into confirmable, rejectable, auditable operations
- 🛡️ **Execution Guards** — Supports capability switches, manual confirmation, protected channel rules, and cooldowns
- ⏰ **Scheduled Inspections** — Supports configurable interval-based scheduled inspections
- 🐳 **Docker Deployment** — GHCR image available, can be deployed alongside `new-api` in the same stack

## 🏗️ Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript |
| Frontend | Vue 3 + Vite |
| Icons | Lucide Icons |
| Container | Docker (Alpine) |
| CI/CD | GitHub Actions → GHCR |

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.3+
- A running `new-api` instance
- An OpenAI-compatible LLM API

### Installation

```bash
git clone https://github.com/Everforever7/new-api-ai-ops.git
cd new-api-ai-ops
bun install
cp .env.example .env
```

### Configuration

Edit the `.env` file and fill in the required parameters:

```env
# new-api address
NEWAPI_BASE_URL=http://localhost:3000

# Authentication (choose one)
# Option 1: Username/password login (recommended for Docker)
NEWAPI_USERNAME=admin
NEWAPI_PASSWORD=your-password

# Option 2: Use Cookie directly (when Turnstile/2FA is enabled)
# NEWAPI_COOKIE=your-cookie-string
# NEWAPI_USER_HEADER=1

# LLM configuration (can point to your own new-api endpoint)
LLM_BASE_URL=http://localhost:3000/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4.1-mini

# Discord Webhook (optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

> **💡 Tip:** `LLM_BASE_URL` can point directly to your own `new-api` instance's `/v1` endpoint for self-bootstrapping.

### Running

```bash
# Run a single inspection
bun run once

# Dry run (no Discord, prints report only)
bun run dry-run

# Start scheduled loop (runs at REPORT_INTERVAL_MINUTES intervals)
bun run start
```

## 🖥️ Management Panel

The built-in web management panel runs on port `8787`.

### Panel Configuration

```env
PANEL_ENABLED=true
PANEL_HOST=0.0.0.0
PANEL_PORT=8787
PANEL_USERNAME=admin
PANEL_PASSWORD=change-this-password
```

### Running the Panel

```bash
# Panel only (without scheduler)
bun run panel

# Development mode (panel API + Vue frontend hot reload)
bun run dev

# Build frontend for production
bun run build
```

> In development mode, the Vue dev server runs on port `5173` by default and proxies `/api/*` to the Bun panel server on port `8787`.

### Panel Features

| Feature | Description |
|---------|-------------|
| 🔍 Status View | View sidecar runtime status |
| 🔄 Manual Inspection | Trigger a manual check (no Discord by default) |
| 📄 Report View | View the latest generated operations report |
| 📡 Channel Snapshot | View sanitized channel information |
| 🤖 Action Queue | Review AI-proposed actions, execute or reject pending operations |
| ⚙️ Execution Settings | Configure AI permissions, confirmation strategy, and protected channel rules |

## 🐳 Docker Deployment

### Image

GitHub Actions automatically builds and publishes the image on `main` branch pushes:

```
ghcr.io/everforever7/new-api-ai-ops:latest
```

You can also manually trigger the `Publish Docker image` workflow from the repository's Actions tab.

### Docker Compose

Recommended to deploy alongside `new-api` using Docker internal networking:

```yaml
services:
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
      LLM_MODEL: "gpt-4.1-mini"
      DISCORD_WEBHOOK_URL: "${AI_OPS_DISCORD_WEBHOOK_URL}"
      REPORT_INTERVAL_MINUTES: "15"
      PANEL_ENABLED: "true"
      PANEL_USERNAME: "${AI_OPS_PANEL_USERNAME:-admin}"
      PANEL_PASSWORD: "${AI_OPS_PANEL_PASSWORD}"
      TZ: "${TZ}"
    ports:
      - "8787:8787"
    volumes:
      - ./ai_ops_reports:/app/reports
    networks: [newapi-net]
```

> **💡 Tip:** If using Cloudflare Tunnel, you can remove the `ports:` section and route a public domain to `http://new-api-ai-ops:8787` (this is a Docker internal address and requires a Tunnel, Nginx, or other reverse proxy for public access).

## ⚙️ Environment Variables

### new-api Connection

| Variable | Description | Default |
|----------|-------------|---------|
| `NEWAPI_BASE_URL` | new-api address | `http://localhost:3000` |
| `NEWAPI_USERNAME` | Admin username | — |
| `NEWAPI_PASSWORD` | Admin password | — |
| `NEWAPI_COOKIE` | Direct Cookie authentication | — |
| `NEWAPI_AUTHORIZATION` | Direct Authorization header | — |
| `NEWAPI_USER_HEADER` | Admin user ID (required for Cookie mode) | — |
| `NEWAPI_REQUEST_TIMEOUT_MS` | Request timeout | `20000` |

### Data Collection

| Variable | Description | Default |
|----------|-------------|---------|
| `NEWAPI_CHANNEL_PAGE_SIZE` | Channel page size | `100` |
| `NEWAPI_LOG_PAGE_SIZE` | Log page size | `100` |
| `NEWAPI_LOG_HOURS` | Log collection window (hours) | `1` |
| `BALANCE_WARNING_USD` | Balance warning threshold (USD) | `5` |

### LLM Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_BASE_URL` | OpenAI-compatible endpoint | `http://localhost:3000/v1` |
| `LLM_API_KEY` | API key | — |
| `LLM_MODEL` | Model name | `gpt-4.1-mini` |
| `LLM_TEMPERATURE` | Temperature parameter | `0.2` |

### Report & Scheduling

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL | — |
| `REPORT_INTERVAL_MINUTES` | Inspection interval (minutes) | `15` |
| `REPORT_MIN_REQUESTS` | Minimum request count threshold | `20` |
| `REPORT_FAILURE_RATE_THRESHOLD` | Failure rate alert threshold | `0.3` |
| `REPORT_TIMEZONE` | Report timezone | `Asia/Hong_Kong` |
| `REPORT_SAVE_DIR` | Report save directory | `reports` |

### Management Panel

| Variable | Description | Default |
|----------|-------------|---------|
| `PANEL_ENABLED` | Enable panel | `true` |
| `PANEL_HOST` | Listen address | `0.0.0.0` |
| `PANEL_PORT` | Listen port | `8787` |
| `PANEL_USERNAME` | Panel username | `admin` |
| `PANEL_PASSWORD` | Panel password | — |

## 🔒 Safety Model

The current version supports controlled execution with these rules:

- ✅ Supported actions are limited to testing channels, recording low-balance notices, creating channels, updating channels, disabling channels, and deleting channels
- ⚠️ Creating, updating, disabling, and deleting channels are gated by panel permissions and confirmation strategy
- 🛡️ Protected channel IDs, groups, tags, names, models, and types are skipped for AI modification
- 📝 Executed, failed, and rejected operations are recorded in `data/action-audit.jsonl`
- 🔀 Discord reports and execution approvals are kept separate

## 📄 License

[MIT](LICENSE)
