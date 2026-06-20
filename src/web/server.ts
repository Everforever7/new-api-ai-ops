import { extname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppConfig } from '../config'
import type { Channel } from '../types/domain'
import { NewApiClient } from '../newapi/client'
import { OpsRuntime } from '../runtime'
import { logger } from '../logger'
import {
  loadEffectiveLlmConfig,
  loadOpsSettings,
  loadPublicOpsSettings,
  savePublicOpsSettings,
} from '../settings'
import { pruneReports } from '../reporters/save'
import { pruneActionAudit } from '../actions'
import {
  getChannelMemory,
  getChannelTestHistory,
  listChannelMemories,
  saveChannelMemory,
} from '../testing'

type JsonValue = Record<string, unknown> | unknown[]

const staticRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url))

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function json(data: JsonValue, status = 200) {
  return Response.json({ success: status < 400, data }, { status })
}

function jsonError(message: string, status = 500) {
  return Response.json({ success: false, message }, { status })
}

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function streamErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith('Basic ')) return undefined
  try {
    const encoded = atob(header.slice('Basic '.length))
    const bytes = Uint8Array.from(encoded, (char) => char.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
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
  })
}

function contentType(filePath: string) {
  return contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function resolveStaticPath(pathname: string) {
  let decoded: string

  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return undefined
  }

  const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const filePath = join(staticRoot, relativePath)
  const resolvedRelative = relative(staticRoot, filePath)

  if (resolvedRelative.startsWith('..') || isAbsolute(resolvedRelative)) {
    return undefined
  }

  return filePath
}

async function servePanelAsset(url: URL) {
  const filePath = resolveStaticPath(url.pathname)
  if (!filePath) return new Response('Not found', { status: 404 })

  const file = Bun.file(filePath)
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        'Content-Type': contentType(filePath),
      },
    })
  }

  if (!extname(url.pathname)) {
    const indexPath = join(staticRoot, 'index.html')
    const index = Bun.file(indexPath)

    if (await index.exists()) {
      return new Response(index, {
        headers: {
          'Content-Type': contentType(indexPath),
        },
      })
    }
  }

  return new Response(
    'Panel frontend is not built. Run `bun run web:build` first.',
    { status: 404 }
  )
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

function cleanUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readModelId(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (!isRecord(value)) return ''
  const id = value.id ?? value.model ?? value.name
  return typeof id === 'string' ? id.trim() : ''
}

function readNumberList(value: unknown) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map(Number)
        .filter((item) => Number.isInteger(item) && item > 0)
    ),
  ]
}

async function fetchLlmModels(config: AppConfig, input: unknown) {
  const effective = await loadEffectiveLlmConfig(config)
  const llm = isRecord(input) ? isRecord(input.llm) ? input.llm : input : {}
  const baseUrl =
    typeof llm.baseUrl === 'string' && llm.baseUrl.trim()
      ? cleanUrl(llm.baseUrl)
      : effective.baseUrl
  const apiKey =
    llm.clearApiKey === true
      ? undefined
      : typeof llm.apiKey === 'string' && llm.apiKey.trim()
        ? llm.apiKey.trim()
        : effective.apiKey

  if (!baseUrl) {
    throw new Error('LLM base URL is required')
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const response = await fetch(`${baseUrl}/models`, { headers })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `LLM models ${response.status} ${response.statusText}: ${text.slice(0, 300)}`
    )
  }

  const payload = text ? JSON.parse(text) as unknown : {}
  const source = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : isRecord(payload) && Array.isArray(payload.models)
        ? payload.models
        : []
  const models = [...new Set(source.map(readModelId).filter(Boolean))].sort()

  return {
    models,
    count: models.length,
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
      const llmConfig = await loadEffectiveLlmConfig(config)
      const settings = await loadOpsSettings()
      return json({
        ...runtime.getState(),
        config: {
          newApiBaseUrl: config.newApi.baseUrl,
          llmBaseUrl: llmConfig.baseUrl,
          llmModel: llmConfig.model,
          hasLlmApiKey: Boolean(llmConfig.apiKey),
          hasDiscordWebhook: Boolean(config.discord.webhookUrl),
          reportIntervalMinutes: settings.report.intervalMinutes,
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

    if (url.pathname === '/api/settings' && req.method === 'GET') {
      return json(await loadPublicOpsSettings(config))
    }

    if (url.pathname === '/api/settings' && req.method === 'PUT') {
      const body = await req.json().catch(() => {
        throw new Error('invalid settings JSON')
      })
      const saved = await savePublicOpsSettings(body, config)
      await Promise.all([
        pruneReports(config.report.saveDir, saved.storage.maxReports),
        pruneActionAudit(saved.storage.maxActionAuditEntries),
      ])
      await runtime.refreshReportScheduler()
      await runtime.refreshActiveTestingScheduler()
      return json(saved)
    }

    if (url.pathname === '/api/llm/models' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      return json(await fetchLlmModels(config, body))
    }

    if (url.pathname === '/api/actions' && req.method === 'GET') {
      return json(runtime.getActions())
    }

    if (url.pathname === '/api/tests/run' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const input = isRecord(body) ? body : {}
      return json(
        await runtime.runChannelTests({
          channelIds: readNumberList(input.channelIds),
          model: typeof input.model === 'string' ? input.model : undefined,
          triggeredBy: 'manual',
        })
      )
    }

    if (url.pathname === '/api/tests/history' && req.method === 'GET') {
      const channelId = Number(url.searchParams.get('channelId') || '')
      const limit = Number(url.searchParams.get('limit') || '')
      return json(
        await getChannelTestHistory({
          channelId: Number.isInteger(channelId) && channelId > 0
            ? channelId
            : undefined,
          limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
        })
      )
    }

    if (url.pathname === '/api/channel-memory' && req.method === 'GET') {
      return json(await listChannelMemories())
    }

    const memoryMatch = url.pathname.match(/^\/api\/channel-memory\/(\d+)$/)
    if (memoryMatch && req.method === 'GET') {
      return json(await getChannelMemory(Number(memoryMatch[1])))
    }

    if (memoryMatch && req.method === 'PUT') {
      const body = await req.json().catch(() => {
        throw new Error('invalid channel memory JSON')
      })
      return json(await saveChannelMemory(Number(memoryMatch[1]), body))
    }

    if (url.pathname === '/api/assistant/session' && req.method === 'GET') {
      return json(runtime.getAssistantSession())
    }

    if (url.pathname === '/api/assistant/reset' && req.method === 'POST') {
      return json(runtime.resetAssistantSession())
    }

    if (url.pathname === '/api/assistant/message/stream' && req.method === 'POST') {
      const body = await req.json().catch(() => {
        throw new Error('invalid assistant message JSON')
      })
      if (!isRecord(body) || typeof body.message !== 'string') {
        throw new Error('assistant message is required')
      }

      const assistantInput = body.message
      const encoder = new TextEncoder()
      const userMessageId =
        typeof body.userMessageId === 'string' ? body.userMessageId : undefined
      const assistantMessageId =
        typeof body.assistantMessageId === 'string'
          ? body.assistantMessageId
          : undefined

      return new Response(
        new ReadableStream({
          async start(controller) {
            const send = (event: string, data: unknown) => {
              controller.enqueue(encoder.encode(sseEvent(event, data)))
            }

            try {
              await runtime.streamAssistantMessage(
                assistantInput,
                { userMessageId, assistantMessageId },
                async (event) => {
                  const { type, ...data } = event
                  send(type, data)
                }
              )
            } catch (error) {
              send('error', { message: streamErrorMessage(error) })
            } finally {
              controller.close()
            }
          },
        }),
        {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        }
      )
    }

    if (url.pathname === '/api/assistant/message' && req.method === 'POST') {
      const body = await req.json().catch(() => {
        throw new Error('invalid assistant message JSON')
      })
      if (!body || typeof body !== 'object' || typeof body.message !== 'string') {
        throw new Error('assistant message is required')
      }
      return json(await runtime.sendAssistantMessage(body.message))
    }

    const actionMatch = url.pathname.match(/^\/api\/actions\/([^/]+)\/(execute|reject)$/)
    if (actionMatch && req.method === 'POST') {
      const [, actionId, actionVerb] = actionMatch
      const decodedActionId = decodeURIComponent(actionId)
      return json(
        actionVerb === 'execute'
          ? await runtime.executeAction(decodedActionId)
          : await runtime.rejectAction(decodedActionId)
      )
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

      if (url.pathname.startsWith('/api/')) {
        if (!isAuthorized(req, config)) {
          return unauthorized()
        }
        return handleApi(req, url, config, runtime)
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        return servePanelAsset(url)
      }

      return new Response('Not found', { status: 404 })
    },
  })

  logger.info(
    `panel listening on http://${config.panel.host}:${server.port}`
  )
  return server
}
