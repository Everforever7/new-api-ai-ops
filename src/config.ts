export type AppConfig = {
  newApi: {
    baseUrl: string
    cookie?: string
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
  policy: {
    autoExecute: boolean
  }
}

function cleanUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function optional(value: string | undefined): string | undefined {
  const next = value?.trim()
  return next ? next : undefined
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
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
  return {
    newApi: {
      baseUrl: cleanUrl(process.env.NEWAPI_BASE_URL || 'http://localhost:3000'),
      cookie: optional(process.env.NEWAPI_COOKIE),
      authorization: optional(process.env.NEWAPI_AUTHORIZATION),
      userHeader: optional(process.env.NEWAPI_USER_HEADER),
      extraHeaders: extraHeadersEnv(),
      timeoutMs: numberEnv('NEWAPI_REQUEST_TIMEOUT_MS', 20_000),
      channelPageSize: numberEnv('NEWAPI_CHANNEL_PAGE_SIZE', 100),
      logPageSize: numberEnv('NEWAPI_LOG_PAGE_SIZE', 100),
      logHours: numberEnv('NEWAPI_LOG_HOURS', 1),
      balanceWarningUsd: numberEnv('BALANCE_WARNING_USD', 5),
    },
    llm: {
      baseUrl: cleanUrl(process.env.LLM_BASE_URL || 'http://localhost:3000/v1'),
      apiKey: optional(process.env.LLM_API_KEY),
      model: process.env.LLM_MODEL?.trim() || 'gpt-4.1-mini',
      temperature: numberEnv('LLM_TEMPERATURE', 0.2),
    },
    discord: {
      webhookUrl: optional(process.env.DISCORD_WEBHOOK_URL),
    },
    report: {
      intervalMinutes: numberEnv('REPORT_INTERVAL_MINUTES', 15),
      minRequests: numberEnv('REPORT_MIN_REQUESTS', 20),
      failureRateThreshold: numberEnv('REPORT_FAILURE_RATE_THRESHOLD', 0.3),
      timezone: process.env.REPORT_TIMEZONE?.trim() || 'Asia/Hong_Kong',
      saveDir: process.env.REPORT_SAVE_DIR?.trim() || 'reports',
      includeRawSummary: booleanEnv('REPORT_INCLUDE_RAW_SUMMARY'),
    },
    policy: {
      autoExecute: booleanEnv('AUTO_EXECUTE'),
    },
  }
}
