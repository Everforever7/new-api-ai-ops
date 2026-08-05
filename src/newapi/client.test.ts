import { expect, test } from 'bun:test'
import { NewApiClient } from './client'

test('getAdminTokens loads every admin-token page without exposing token keys', async () => {
  const originalFetch = globalThis.fetch
  const requestedPages: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    requestedPages.push(url.searchParams.get('p') || '')
    const id = Number(url.searchParams.get('p'))
    return new Response(JSON.stringify({
      success: true,
      data: {
        items: [{
          id,
          user_id: id,
          name: `device-${id}/酒馆/RPR`,
          status: 1,
          created_time: 1,
          accessed_time: 1,
          username: `user-${id}`,
          user_status: 1,
          user_role: 1,
          user_group: 'default',
          token_group: 'default',
        }],
        total: 2,
      },
    }), { headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    const client = new NewApiClient({
      baseUrl: 'http://new-api.test',
      authorization: 'Bearer test',
      extraHeaders: {},
      timeoutMs: 1_000,
      channelPageSize: 100,
      tokenPageSize: 1,
      logPageSize: 100,
      logHours: 1,
      balanceWarningUsd: 5,
    })
    const result = await client.getAdminTokens()

    expect(requestedPages.sort()).toEqual(['1', '2'])
    expect(result.items.map((token) => token.id)).toEqual([1, 2])
    expect(result.items.some((token) => 'key' in token)).toBe(false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('manageUser sends the existing new-api disable-user command', async () => {
  const originalFetch = globalThis.fetch
  let request: { url: string; method?: string; body?: string } | undefined
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    request = {
      url: String(input),
      method: init?.method,
      body: typeof init?.body === 'string' ? init.body : undefined,
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const client = new NewApiClient({
      baseUrl: 'http://new-api.test',
      authorization: 'Bearer test',
      extraHeaders: {},
      timeoutMs: 1_000,
      channelPageSize: 100,
      tokenPageSize: 100,
      logPageSize: 100,
      logHours: 1,
      balanceWarningUsd: 5,
    })
    await client.manageUser(77, 'disable')

    expect(request).toEqual({
      url: 'http://new-api.test/api/user/manage',
      method: 'POST',
      body: JSON.stringify({ id: 77, action: 'disable' }),
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
