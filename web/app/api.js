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
