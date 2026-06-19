import type { AppConfig } from '../config'
import type {
  ApiEnvelope,
  ChannelListData,
  LogListData,
  LogStats,
} from '../types/domain'

type RequestOptions = {
  method?: string
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  allowMissingData?: boolean
}

type LoginData = {
  id?: number | string
}

function buildQuery(query: RequestOptions['query']): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export class NewApiClient {
  private readonly config: AppConfig['newApi']
  private sessionCookie?: string
  private sessionUserId?: string
  private loginPromise?: Promise<void>

  constructor(config: AppConfig['newApi']) {
    this.config = config
    this.sessionCookie = config.cookie
    this.sessionUserId = config.userHeader
  }

  async getChannels(): Promise<ChannelListData> {
    const first = await this.request<ChannelListData>('/api/channel', {
      query: { p: 1, page_size: this.config.channelPageSize },
    })
    const total = first.total || first.items.length
    if (first.items.length >= total) return first

    const pages = Math.ceil(total / this.config.channelPageSize)
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) =>
        this.request<ChannelListData>('/api/channel', {
          query: {
            p: index + 2,
            page_size: this.config.channelPageSize,
          },
        })
      )
    )

    return {
      ...first,
      items: [first, ...rest].flatMap((page) => page.items),
      total,
    }
  }

  async getRecentLogs(startTimestamp: number, endTimestamp: number) {
    return this.request<LogListData>('/api/log', {
      query: {
        p: 1,
        page_size: this.config.logPageSize,
        start_timestamp: startTimestamp,
        end_timestamp: endTimestamp,
      },
    })
  }

  async getLogStats(startTimestamp: number, endTimestamp: number) {
    return this.request<LogStats>('/api/log/stat', {
      query: {
        start_timestamp: startTimestamp,
        end_timestamp: endTimestamp,
      },
    })
  }

  async getChannel(id: number) {
    return this.request<Record<string, unknown>>(`/api/channel/${id}`)
  }

  async testChannel(id: number, model?: string) {
    return this.request<Record<string, unknown>>(`/api/channel/test/${id}`, {
      query: { model },
      allowMissingData: true,
    })
  }

  async createChannel(data: unknown) {
    return this.request<Record<string, unknown>>('/api/channel', {
      method: 'POST',
      body: data,
      allowMissingData: true,
    })
  }

  async updateChannel(id: number, data: Record<string, unknown>) {
    return this.request<Record<string, unknown>>('/api/channel/', {
      method: 'PUT',
      body: { id, ...data },
      allowMissingData: true,
    })
  }

  async deleteChannel(id: number) {
    return this.request<Record<string, unknown>>(`/api/channel/${id}`, {
      method: 'DELETE',
      allowMissingData: true,
    })
  }

  private async request<T>(path: string, options: RequestOptions = {}) {
    await this.ensureSession()
    return this.requestWithSession<T>(path, options, true)
  }

  private async requestWithSession<T>(
    path: string,
    options: RequestOptions = {},
    retryAfterLogin: boolean
  ): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)
    const url = `${this.config.baseUrl}${path}${buildQuery(options.query)}`

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: this.headers(options.body !== undefined),
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      })
      const text = await response.text()
      const json = text ? (JSON.parse(text) as ApiEnvelope<T>) : {}

      if (!response.ok) {
        if (response.status === 401 && retryAfterLogin) {
          this.sessionCookie = undefined
          this.sessionUserId = this.config.userHeader
          await this.ensureSession(true)
          return this.requestWithSession<T>(path, options, false)
        }
        throw new Error(
          `new-api ${response.status} ${response.statusText}: ${
            json.message || text.slice(0, 300)
          }`
        )
      }
      if (json.success === false) {
        throw new Error(`new-api business error: ${json.message || 'unknown'}`)
      }
      if (json.data === undefined && !options.allowMissingData) {
        throw new Error(`new-api response missing data for ${path}`)
      }
      return (json.data ?? {
        message: json.message || 'ok',
      }) as T
    } finally {
      clearTimeout(timeout)
    }
  }

  private async ensureSession(force = false) {
    if (!force && this.sessionCookie) return
    if (!this.config.username || !this.config.password) return

    this.loginPromise ??= this.login()
    try {
      await this.loginPromise
    } finally {
      this.loginPromise = undefined
    }
  }

  private async login() {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      const response = await fetch(`${this.config.baseUrl}/api/user/login`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...this.config.extraHeaders,
        },
        body: JSON.stringify({
          username: this.config.username,
          password: this.config.password,
        }),
        signal: controller.signal,
      })
      const text = await response.text()
      const json = text ? (JSON.parse(text) as ApiEnvelope<LoginData>) : {}

      if (!response.ok || json.success === false) {
        throw new Error(
          `new-api login failed: ${response.status} ${
            json.message || text.slice(0, 300)
          }`
        )
      }

      const cookie = extractCookieHeader(response.headers)
      if (!cookie) {
        throw new Error('new-api login succeeded but Set-Cookie was empty')
      }
      this.sessionCookie = cookie
      const userId = json.data?.id
      if (userId !== undefined && userId !== null) {
        this.sessionUserId = String(userId)
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  private headers(hasBody: boolean) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.config.extraHeaders,
    }
    if (hasBody) headers['Content-Type'] = 'application/json'
    if (this.sessionCookie) headers.Cookie = this.sessionCookie
    if (this.config.authorization) {
      headers.Authorization = this.config.authorization
    }
    const userHeader = this.config.userHeader || this.sessionUserId
    if (userHeader) {
      headers['New-Api-User'] = userHeader
    }
    return headers
  }
}

function extractCookieHeader(headers: Headers) {
  const headerWithGetter = headers as Headers & {
    getSetCookie?: () => string[]
  }
  const setCookies =
    typeof headerWithGetter.getSetCookie === 'function'
      ? headerWithGetter.getSetCookie()
      : splitCombinedSetCookie(headers.get('set-cookie'))

  const pairs = setCookies
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))

  return pairs.join('; ')
}

function splitCombinedSetCookie(value: string | null) {
  if (!value) return []
  return value.split(/,(?=\s*[^;,\s]+=)/g).map((part) => part.trim())
}
