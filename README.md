<div align="center">

# 🤖 New API AI Ops

**为 [new-api](https://github.com/Calcium-Ion/new-api) 打造的 AI 智能运维助手**

[![Docker Image](https://img.shields.io/badge/GHCR-ghcr.io/everforever7/new--api--ai--ops-blue?logo=docker)](https://ghcr.io/everforever7/new-api-ai-ops)
[![Bun](https://img.shields.io/badge/Runtime-Bun-f9f1e1?logo=bun)](https://bun.sh)
[![Vue 3](https://img.shields.io/badge/Frontend-Vue%203-4FC08D?logo=vuedotjs)](https://vuejs.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[English](./README_EN.md) | 简体中文

</div>

---

## 📖 简介

New API AI Ops 是一个独立的 Sidecar 运维助手，专为 `new-api` 设计。它从 `new-api` 的管理 API 采集渠道状态和调用日志，借助 OpenAI 兼容大模型自动生成运维巡检报告，并可将报告推送至 Discord Webhook。

> **当前版本支持受控 AI 执行** — AI 可以提出动作，实际执行会经过设置页的权限、确认策略、保护规则与审计日志约束。

## ✨ 功能特性

- 📊 **自动采集** — 从 `/api/channel`、`/api/log`、`/api/log/stat` 获取渠道与日志数据
- 🧠 **AI 分析** — 调用 LLM 生成中文 Markdown 运维巡检报告
- 💬 **Discord 推送** — 通过 Webhook 自动将报告发送至 Discord 频道
- 💾 **报告存档** — 所有报告自动保存至 `reports/` 目录
- 🖥️ **管理面板** — 内置轻量级 Web 管理面板（Basic Auth 认证）
- 🧩 **动作队列** — 将 AI 建议转为可确认、可拒绝、可审计的操作
- 🛡️ **执行保护** — 支持能力开关、人工确认、保护渠道规则、冷却时间
- ⏰ **定时调度** — 支持可配置间隔的定时巡检
- 🐳 **Docker 部署** — 提供 GHCR 镜像，可直接与 `new-api` 同栈部署

## 🏗️ 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) |
| 语言 | TypeScript |
| 前端 | Vue 3 + Vite |
| 图标 | Lucide Icons |
| 容器 | Docker (Alpine) |
| CI/CD | GitHub Actions → GHCR |

## 🚀 快速开始

### 前置要求

- [Bun](https://bun.sh) v1.3+
- 一个正在运行的 `new-api` 实例
- 一个 OpenAI 兼容的 LLM API

### 安装

```bash
git clone https://github.com/Everforever7/new-api-ai-ops.git
cd new-api-ai-ops
bun install
cp .env.example .env
```

### 配置

编辑 `.env` 文件，填写必要参数：

```env
# new-api 地址
NEWAPI_BASE_URL=http://localhost:3000

# 认证方式（二选一）
# 方式一：用户名密码登录（Docker 部署推荐）
NEWAPI_USERNAME=admin
NEWAPI_PASSWORD=your-password

# 方式二：直接使用 Cookie（有 Turnstile/2FA 时使用）
# NEWAPI_COOKIE=your-cookie-string
# NEWAPI_USER_HEADER=1

# LLM 配置（可指向你自己的 new-api 端点）
LLM_BASE_URL=http://localhost:3000/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4.1-mini

# Discord Webhook（可选）
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

> **💡 提示：** `LLM_BASE_URL` 可以直接指向你自己的 `new-api` 实例的 `/v1` 端点，实现自举。

### 运行

```bash
# 执行一次巡检
bun run once

# 试运行（不发送 Discord，仅打印报告）
bun run dry-run

# 启动定时调度（按 REPORT_INTERVAL_MINUTES 间隔循环执行）
bun run start
```

## 🖥️ 管理面板

内置的 Web 管理面板运行在 `8787` 端口。

### 配置面板

```env
PANEL_ENABLED=true
PANEL_HOST=0.0.0.0
PANEL_PORT=8787
PANEL_USERNAME=admin
PANEL_PASSWORD=change-this-password
```

### 运行面板

```bash
# 仅启动面板（不含调度器）
bun run panel

# 开发模式（面板 API + Vue 前端热重载）
bun run dev

# 构建前端用于生产部署
bun run build
```

> 开发模式下，Vue 开发服务器默认运行在 `5173` 端口，自动代理 `/api/*` 到 Bun 面板服务的 `8787` 端口。

### 面板功能

| 功能 | 说明 |
|------|------|
| 🔍 状态查看 | 查看 Sidecar 运行状态 |
| 🔄 手动巡检 | 触发一次手动检查（默认不发送 Discord） |
| 📄 报告查看 | 查看最新生成的运维报告 |
| 📡 渠道快照 | 查看脱敏后的渠道信息 |
| 🤖 动作队列 | 查看 AI 建议动作，执行或拒绝待确认操作 |
| ⚙️ 执行设置 | 配置 AI 能力权限、确认策略、保护渠道规则 |

## 🐳 Docker 部署

### 镜像

GitHub Actions 在 `main` 分支推送时自动构建并发布镜像：

```
ghcr.io/everforever7/new-api-ai-ops:latest
```

也可在仓库的 Actions 标签页手动触发 `Publish Docker image` 工作流发布。

### Docker Compose

推荐与 `new-api` 同栈部署，使用 Docker 内部网络通信：

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

> **💡 提示：** 如果使用 Cloudflare Tunnel，可以移除 `ports:` 配置，将公共域名路由到 `http://new-api-ai-ops:8787`（这是 Docker 内部地址，需要通过 Tunnel、Nginx 等反向代理对外暴露）。

## ⚙️ 环境变量参考

### new-api 连接

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NEWAPI_BASE_URL` | new-api 地址 | `http://localhost:3000` |
| `NEWAPI_USERNAME` | 管理员用户名 | — |
| `NEWAPI_PASSWORD` | 管理员密码 | — |
| `NEWAPI_COOKIE` | 直接使用 Cookie 认证 | — |
| `NEWAPI_AUTHORIZATION` | 直接使用 Authorization 头 | — |
| `NEWAPI_USER_HEADER` | 管理员用户 ID（Cookie 模式必填） | — |
| `NEWAPI_REQUEST_TIMEOUT_MS` | 请求超时时间 | `20000` |

### 数据采集

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NEWAPI_CHANNEL_PAGE_SIZE` | 渠道分页大小 | `100` |
| `NEWAPI_LOG_PAGE_SIZE` | 日志分页大小 | `100` |
| `NEWAPI_LOG_HOURS` | 日志采集窗口（小时） | `1` |
| `BALANCE_WARNING_USD` | 余额预警阈值（美元） | `5` |

### LLM 配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_BASE_URL` | OpenAI 兼容端点 | `http://localhost:3000/v1` |
| `LLM_API_KEY` | API 密钥 | — |
| `LLM_MODEL` | 模型名称 | `gpt-4.1-mini` |
| `LLM_TEMPERATURE` | 温度参数 | `0.2` |

### 报告 & 调度

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DISCORD_WEBHOOK_URL` | Discord Webhook 地址 | — |
| `REPORT_INTERVAL_MINUTES` | 巡检间隔（分钟） | `15` |
| `REPORT_MIN_REQUESTS` | 最小请求数阈值 | `20` |
| `REPORT_FAILURE_RATE_THRESHOLD` | 失败率告警阈值 | `0.3` |
| `REPORT_TIMEZONE` | 报告时区 | `Asia/Hong_Kong` |
| `REPORT_SAVE_DIR` | 报告保存目录 | `reports` |

### 管理面板

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PANEL_ENABLED` | 是否启用面板 | `true` |
| `PANEL_HOST` | 监听地址 | `0.0.0.0` |
| `PANEL_PORT` | 监听端口 | `8787` |
| `PANEL_USERNAME` | 面板用户名 | `admin` |
| `PANEL_PASSWORD` | 面板密码 | — |

## 🔒 安全模型

当前版本已经具备受控执行能力，执行策略遵循以下原则：

- ✅ 支持的动作限定为测试渠道、低余额记录、创建渠道、修改渠道、禁用渠道、删除渠道
- ⚠️ 创建、修改、禁用、删除渠道均受设置页权限与确认策略约束
- 🛡️ 受保护的渠道 ID、分组、标签、名称、模型、类型会跳过 AI 修改
- 📝 已执行、失败、拒绝的操作记录到 `data/action-audit.jsonl`
- 🧹 报告文件与动作审计日志可在设置页的“存储保留”中配置最大保留数量
- 🔀 Discord 报告与执行审批分离

## 📄 License

[MIT](LICENSE)
