async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))

  if (!res.ok || data.success === false) {
    throw new Error(data.message || res.statusText)
  }

  return data.data
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
