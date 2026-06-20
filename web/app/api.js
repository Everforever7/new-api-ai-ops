const AUTH_STORAGE_KEY = 'newapi_auth'

export function getStoredAuth() {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredAuth(authHeader) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, authHeader)
  } catch {}
}

export function clearStoredAuth() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {}
}

function hasAuthorizationHeader(headers) {
  return Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')
}

function dispatchUnauthorized() {
  clearStoredAuth()
  window.dispatchEvent(new Event('auth:unauthorized'))
}

function createAuthError() {
  const error = new Error('Authentication required')
  error.status = 401
  return error
}

function createHeaders(customHeaders = {}, useStoredAuth = true) {
  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders,
  }

  const auth = getStoredAuth()
  if (useStoredAuth && auth && !hasAuthorizationHeader(headers)) {
    headers['Authorization'] = auth
  }

  return headers
}

async function readErrorMessage(res) {
  const text = await res.text().catch(() => '')
  if (!text) return res.statusText

  try {
    const data = JSON.parse(text)
    return data.message || data.error || res.statusText
  } catch {
    return text
  }
}

function createBasicAuthHeader(username, password) {
  const value = `${username}:${password}`
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return `Basic ${btoa(binary)}`
}

async function api(path, options = {}) {
  const {
    headers: customHeaders,
    useStoredAuth = true,
    ...fetchOptions
  } = options
  const headers = createHeaders(customHeaders, useStoredAuth)

  const res = await fetch(path, {
    ...fetchOptions,
    headers,
  })

  if (res.status === 401) {
    dispatchUnauthorized()
    throw createAuthError()
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok || data.success === false) {
    throw new Error(data.message || res.statusText)
  }

  return data.data
}

export async function login(username, password) {
  const authHeader = createBasicAuthHeader(username, password)
  const status = await api('/api/status', {
    useStoredAuth: false,
    headers: {
      Authorization: authHeader,
    },
  })

  setStoredAuth(authHeader)
  return status
}

export function getStatus() {
  return api('/api/status')
}

export function getChannels() {
  return api('/api/channels')
}

export function runCheck() {
  return api('/api/run', {
    method: 'POST',
    body: '{}',
  })
}

export function getSettings() {
  return api('/api/settings')
}

export function saveSettings(settings) {
  return api('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export function getActions() {
  return api('/api/actions')
}

export function getActionAudit(options = {}) {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  const query = params.toString()
  return api(`/api/actions/audit${query ? `?${query}` : ''}`)
}

export function executeAction(actionId) {
  return api(`/api/actions/${encodeURIComponent(actionId)}/execute`, {
    method: 'POST',
    body: '{}',
  })
}

export function testCreateAction(actionId) {
  return api(`/api/actions/${encodeURIComponent(actionId)}/test-create`, {
    method: 'POST',
    body: '{}',
  })
}

export function rejectAction(actionId) {
  return api(`/api/actions/${encodeURIComponent(actionId)}/reject`, {
    method: 'POST',
    body: '{}',
  })
}

export function getAssistantSession() {
  return api('/api/assistant/session')
}

export function resetAssistantSession() {
  return api('/api/assistant/reset', {
    method: 'POST',
    body: '{}',
  })
}

export function sendAssistantMessage(message) {
  return api('/api/assistant/message', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

export async function streamAssistantMessage(
  message,
  requestOptions = {},
  handlers = {}
) {
  const res = await fetch('/api/assistant/message/stream', {
    method: 'POST',
    headers: createHeaders(),
    body: JSON.stringify({
      message,
      userMessageId: requestOptions.userMessageId,
      assistantMessageId: requestOptions.assistantMessageId,
    }),
  })

  if (res.status === 401) {
    dispatchUnauthorized()
    throw createAuthError()
  }

  if (!res.ok) {
    throw new Error(await readErrorMessage(res))
  }

  if (!res.body) {
    throw new Error('Streaming response is not supported by this browser')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let donePayload = null

  const handleBlock = (block) => {
    const parsed = parseSseBlock(block)
    if (!parsed) return

    const payload = parsed.data ? JSON.parse(parsed.data) : {}
    if (parsed.event === 'message') {
      handlers.onMessage?.(payload.message)
      return
    }
    if (parsed.event === 'delta') {
      handlers.onDelta?.(payload)
      return
    }
    if (parsed.event === 'done') {
      donePayload = payload
      handlers.onDone?.(payload)
      return
    }
    if (parsed.event === 'error') {
      throw new Error(payload.message || 'Assistant stream failed')
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    for (const block of blocks) {
      handleBlock(block)
    }
  }

  const tail = decoder.decode()
  if (tail) buffer += tail
  if (buffer.trim()) handleBlock(buffer)

  return donePayload
}

function parseSseBlock(block) {
  const lines = block.split(/\r?\n/)
  const data = []
  let event = 'message'

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue

    const index = line.indexOf(':')
    const field = index >= 0 ? line.slice(0, index) : line
    let value = index >= 0 ? line.slice(index + 1) : ''
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') event = value
    if (field === 'data') data.push(value)
  }

  if (!data.length) return null
  return { event, data: data.join('\n') }
}

export function fetchLlmModels(llm) {
  return api('/api/llm/models', {
    method: 'POST',
    body: JSON.stringify({ llm }),
  })
}

export function runChannelTests(options = {}) {
  return api('/api/tests/run', {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export function getChannelTestHistory(options = {}) {
  const params = new URLSearchParams()
  if (options.channelId) params.set('channelId', String(options.channelId))
  if (options.limit) params.set('limit', String(options.limit))
  const query = params.toString()
  return api(`/api/tests/history${query ? `?${query}` : ''}`)
}

export function getChannelMemories() {
  return api('/api/channel-memory')
}

export function getChannelMemory(channelId) {
  return api(`/api/channel-memory/${encodeURIComponent(channelId)}`)
}

export function saveChannelMemory(channelId, memory) {
  return api(`/api/channel-memory/${encodeURIComponent(channelId)}`, {
    method: 'PUT',
    body: JSON.stringify(memory),
  })
}

export function getReports() {
  return api('/api/reports')
}

export function getSystemLogs(options = {}) {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  const query = params.toString()
  return api(`/api/system-logs${query ? `?${query}` : ''}`)
}
