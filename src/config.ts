import { DEFAULT_APP_CONFIG } from './defaults'

export type AppConfig = {
  newApi: {
    baseUrl: string
    cookie?: string
    username?: string
    password?: string
    authorization?: string
    userHeader?: string
    extraHeaders: Record<string, string>
    timeoutMs: number
    channelPageSize: number
    logPageSize: number
    logHours: number
    balanceWarningUsd: number
  }
  llm: {
    baseUrl: string
    apiKey?: string
    model: string
    temperature: number
  }
  discord: {
    webhookUrl?: string
  }
  report: {
    intervalMinutes: number
    minRequests: number
    failureRateThreshold: number
    timezone: string
    saveDir: string
    includeRawSummary: boolean
  }
  panel: {
    enabled: boolean
    host: string
    port: number
    username: string
    password?: string
  }
}

function cleanUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function optional(value: string | undefined): string | undefined {
  const next = value?.trim()
  return next ? next : undefined
}

function numberEnv(
  name: string,
  fallback: number,
  opts?: { min?: number; max?: number }
): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  if (opts?.min !== undefined && parsed < opts.min) return opts.min
  if (opts?.max !== undefined && parsed > opts.max) return opts.max
  return parsed
}

function booleanEnv(name: string, fallback = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function extraHeadersEnv(): Record<string, string> {
  const raw = process.env.NEWAPI_EXTRA_HEADERS_JSON?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  } catch {
    return {}
  }
}

export function loadConfig(): AppConfig {
  const defaults = DEFAULT_APP_CONFIG
  return {
    newApi: {
      baseUrl: cleanUrl(process.env.NEWAPI_BASE_URL || defaults.newApi.baseUrl),
      cookie: optional(process.env.NEWAPI_COOKIE),
      username: optional(process.env.NEWAPI_USERNAME),
      password: optional(process.env.NEWAPI_PASSWORD),
      authorization: optional(process.env.NEWAPI_AUTHORIZATION),
      userHeader: optional(process.env.NEWAPI_USER_HEADER),
      extraHeaders: extraHeadersEnv(),
      timeoutMs: numberEnv('NEWAPI_REQUEST_TIMEOUT_MS', defaults.newApi.timeoutMs, {
        min: 1000,
        max: 120_000,
      }),
      channelPageSize: numberEnv(
        'NEWAPI_CHANNEL_PAGE_SIZE',
        defaults.newApi.channelPageSize,
        { min: 1, max: 1000 }
      ),
      logPageSize: numberEnv('NEWAPI_LOG_PAGE_SIZE', defaults.newApi.logPageSize, {
        min: 1,
        max: 1000,
      }),
      logHours: numberEnv('NEWAPI_LOG_HOURS', defaults.newApi.logHours, {
        min: 1,
        max: 720,
      }),
      balanceWarningUsd: numberEnv(
        'BALANCE_WARNING_USD',
        defaults.newApi.balanceWarningUsd,
        { min: 0 }
      ),
    },
    llm: {
      baseUrl: cleanUrl(process.env.LLM_BASE_URL || defaults.llm.baseUrl),
      apiKey: optional(process.env.LLM_API_KEY),
      model: process.env.LLM_MODEL?.trim() || defaults.llm.model,
      temperature: numberEnv('LLM_TEMPERATURE', defaults.llm.temperature, {
        min: 0,
        max: 2,
      }),
    },
    discord: {
      webhookUrl: optional(process.env.DISCORD_WEBHOOK_URL),
    },
    report: {
      intervalMinutes: numberEnv(
        'REPORT_INTERVAL_MINUTES',
        defaults.report.intervalMinutes,
        { min: 1, max: 1440 }
      ),
      minRequests: numberEnv('REPORT_MIN_REQUESTS', defaults.report.minRequests, {
        min: 0,
      }),
      failureRateThreshold: numberEnv(
        'REPORT_FAILURE_RATE_THRESHOLD',
        defaults.report.failureRateThreshold,
        { min: 0, max: 1 }
      ),
      timezone: process.env.REPORT_TIMEZONE?.trim() || defaults.report.timezone,
      saveDir: process.env.REPORT_SAVE_DIR?.trim() || defaults.report.saveDir,
      includeRawSummary: booleanEnv(
        'REPORT_INCLUDE_RAW_SUMMARY',
        defaults.report.includeRawSummary
      ),
    },
    panel: {
      enabled: booleanEnv('PANEL_ENABLED', defaults.panel.enabled),
      host: process.env.PANEL_HOST?.trim() || defaults.panel.host,
      port: numberEnv('PANEL_PORT', defaults.panel.port, {
        min: 1,
        max: 65535,
      }),
      username: process.env.PANEL_USERNAME?.trim() || defaults.panel.username,
      password: optional(process.env.PANEL_PASSWORD),
    },
  }
}
