import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

type LogLevel = 'info' | 'warn' | 'error'

export type AppLogEntry = {
  id: string
  timestamp: string
  level: LogLevel
  message: string
  meta?: unknown
}

const APP_LOG_PATH =
  process.env.AI_OPS_APP_LOG_PATH?.trim() || 'data/app-log.jsonl'
const DEFAULT_MAX_APP_LOG_ENTRIES = 5000
const PRUNE_INTERVAL_WRITES = 100
const REDACTED_VALUE = '[REDACTED]'

let maxAppLogEntries = DEFAULT_MAX_APP_LOG_ENTRIES
let writesSincePrune = 0
let pruning = false

function createLogId() {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSensitiveField(key: string) {
  const normalized = key.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return [
    'key',
    'api_key',
    'apikey',
    'authorization',
    'cookie',
    'password',
    'secret',
    'token',
    'access_token',
    'refresh_token',
  ].includes(normalized)
}

function redactText(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED_VALUE}`)
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9._-]{12,}\b/g, REDACTED_VALUE)
    .replace(
      /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      REDACTED_VALUE
    )
}

function sanitizeMeta(value: unknown, fieldName?: string, depth = 0): unknown {
  if (fieldName && isSensitiveField(fieldName)) return REDACTED_VALUE
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      stack: value.stack ? redactText(value.stack).slice(0, 4000) : undefined,
    }
  }
  if (typeof value === 'string') return redactText(value).slice(0, 4000)
  if (typeof value !== 'object' || value === null) return value
  if (depth >= 4) return '[MaxDepth]'

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeMeta(item, undefined, depth + 1))
  }

  if (!isRecord(value)) return String(value)
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 80)
      .map(([key, item]) => [key, sanitizeMeta(item, key, depth + 1)])
  )
}

function normalizeLimit(maxEntries: number) {
  return Math.min(1_000_000, Math.max(1, Math.floor(maxEntries)))
}

export function configureAppLogger(options: { maxEntries?: number } = {}) {
  if (options.maxEntries !== undefined) {
    maxAppLogEntries = normalizeLimit(options.maxEntries)
  }
}

export async function pruneAppLogs(maxEntries = maxAppLogEntries) {
  const limit = normalizeLimit(maxEntries)

  try {
    const raw = await readFile(APP_LOG_PATH, 'utf8')
    const lines = raw.trim().split('\n').filter(Boolean)
    if (lines.length <= limit) return

    await mkdir(dirname(APP_LOG_PATH), { recursive: true })
    await writeFile(APP_LOG_PATH, `${lines.slice(-limit).join('\n')}\n`)
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error
  }
}

export async function listAppLogs(options: { limit?: number } = {}) {
  const limit = Math.min(1000, Math.max(1, Math.floor(options.limit || 200)))

  try {
    const raw = await readFile(APP_LOG_PATH, 'utf8')
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as AppLogEntry
        } catch {
          return undefined
        }
      })
      .filter((entry): entry is AppLogEntry => Boolean(entry))
      .reverse()
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return []
    throw error
  }
}

async function appendAppLog(entry: AppLogEntry) {
  await mkdir(dirname(APP_LOG_PATH), { recursive: true })
  await appendFile(APP_LOG_PATH, `${JSON.stringify(entry)}\n`)

  writesSincePrune += 1
  if (writesSincePrune < PRUNE_INTERVAL_WRITES || pruning) return

  writesSincePrune = 0
  pruning = true
  try {
    await pruneAppLogs()
  } finally {
    pruning = false
  }
}

function write(level: LogLevel, message: string, meta?: unknown) {
  const timestamp = new Date().toISOString()
  const prefix = `[${timestamp}] ${level.toUpperCase()}`
  if (meta === undefined) {
    console[level === 'error' ? 'error' : 'log'](`${prefix} ${message}`)
  } else {
    console[level === 'error' ? 'error' : 'log'](`${prefix} ${message}`, meta)
  }

  const entry: AppLogEntry = {
    id: createLogId(),
    timestamp,
    level,
    message,
    ...(meta === undefined ? {} : { meta: sanitizeMeta(meta) }),
  }
  void appendAppLog(entry).catch((error) => {
    console.warn(`[${new Date().toISOString()}] WARN failed to write app log`, error)
  })
}

export const logger = {
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
}
