import type { AppConfig } from '../config'
import type { Channel } from '../types/domain'
import { NewApiClient } from '../newapi/client'
import { OpsRuntime } from '../runtime'
import { logger } from '../logger'
import { renderPanelHtml } from './page'

type JsonValue = Record<string, unknown> | unknown[]

function json(data: JsonValue, status = 200) {
  return Response.json({ success: status < 400, data }, { status })
}

function jsonError(message: string, status = 500) {
  return Response.json({ success: false, message }, { status })
}

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith('Basic ')) return undefined
  try {
    const decoded = atob(header.slice('Basic '.length))
    const index = decoded.indexOf(':')
    if (index < 0) return undefined
    return {
      username: decoded.slice(0, index),
      password: decoded.slice(index + 1),
    }
  } catch {
    return undefined
  }
}

function isAuthorized(req: Request, config: AppConfig) {
  const auth = parseBasicAuth(req.headers.get('authorization'))
  return (
    auth?.username === config.panel.username &&
    auth.password === config.panel.password
  )
}

function unauthorized() {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="new-api-ai-ops"',
    },
  })
}

function statusLabel(status: number) {
  if (status === 1) return 'enabled'
  if (status === 2) return 'auto disabled'
  if (status === 0) return 'disabled'
  return String(status)
}

function sanitizeChannel(channel: Channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    status: channel.status,
    statusLabel: statusLabel(channel.status),
    group: channel.group,
    tag: channel.tag,
    models: channel.models,
    balance: channel.balance,
    responseTimeMs: channel.response_time,
    priority: channel.priority,
    weight: channel.weight,
  }
}

async function handleApi(
  req: Request,
  url: URL,
  config: AppConfig,
  runtime: OpsRuntime
) {
  try {
    if (url.pathname === '/api/status' && req.method === 'GET') {
      return json({
        ...runtime.getState(),
        config: {
          newApiBaseUrl: config.newApi.baseUrl,
          llmBaseUrl: config.llm.baseUrl,
          llmModel: config.llm.model,
          hasDiscordWebhook: Boolean(config.discord.webhookUrl),
          autoExecute: config.policy.autoExecute,
          reportIntervalMinutes: config.report.intervalMinutes,
        },
      })
    }

    if (url.pathname === '/api/run' && req.method === 'POST') {
      const sendDiscord = url.searchParams.get('send_discord') === '1'
      const result = await runtime.runReport({
        dryRun: !sendDiscord,
        sendDiscord,
        printReport: false,
      })
      return json(result)
    }

    if (url.pathname === '/api/channels' && req.method === 'GET') {
      const client = new NewApiClient(config.newApi)
      const data = await client.getChannels()
      return json(data.items.map(sanitizeChannel))
    }

    return jsonError('not found', 404)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error))
  }
}

export function startPanelServer(config: AppConfig, runtime: OpsRuntime) {
  if (!config.panel.enabled) return
  if (!config.panel.password) {
    logger.warn('panel disabled because PANEL_PASSWORD is empty')
    return
  }

  const server = Bun.serve({
    hostname: config.panel.host,
    port: config.panel.port,
    async fetch(req) {
      const url = new URL(req.url)

      if (url.pathname === '/healthz') {
        return new Response('ok')
      }

      if (!isAuthorized(req, config)) {
        return unauthorized()
      }

      if (url.pathname === '/' && req.method === 'GET') {
        return new Response(renderPanelHtml(), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }

      if (url.pathname.startsWith('/api/')) {
        return handleApi(req, url, config, runtime)
      }

      return new Response('Not found', { status: 404 })
    },
  })

  logger.info(
    `panel listening on http://${config.panel.host}:${server.port}`
  )
  return server
}
