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
  const headers = {
    'Content-Type': 'application/json',
    ...(customHeaders || {}),
  }

  const auth = getStoredAuth()
  if (useStoredAuth && auth && !hasAuthorizationHeader(headers)) {
    headers['Authorization'] = auth
  }

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

export function executeAction(actionId) {
  return api(`/api/actions/${encodeURIComponent(actionId)}/execute`, {
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
