import type { AppConfig } from './config'
import { NewApiClient } from './newapi/client'
import { loadOpsSettings, type OpsSettings } from './settings'
import {
  appendChannelTestRuns,
  listChannelTestRunRecords,
  loadChannelMemoryRecords,
  pruneChannelTestRuns,
  replaceChannelMemoryRecords,
} from './storage/db'
import type {
  Channel,
  ChannelMemory,
  ChannelMemoryPromptItem,
  ChannelTestRun,
} from './types/domain'

export type RunChannelTestsOptions = {
  channelIds?: number[]
  model?: string
  triggeredBy?: ChannelTestRun['triggeredBy']
}

export type RunChannelTestsResult = {
  runs: ChannelTestRun[]
  memories: ChannelMemory[]
  memorySummary: ChannelMemoryPromptItem[]
}

const MAX_SUMMARY_LENGTH = 500
const MAX_TEXT_LENGTH = 2000

function now() {
  return new Date().toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  return String(value || '')
    .trim()
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9._-]{12,}\b/g, '[REDACTED]')
    .replace(
      /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      '[REDACTED]'
    )
    .slice(0, maxLength)
}

export function cleanChannelMemoryNote(value: unknown) {
  return cleanText(value, MAX_TEXT_LENGTH)
}

function summarizeUnknown(value: unknown) {
  if (value === undefined) return undefined
  try {
    return cleanText(JSON.stringify(value), MAX_SUMMARY_LENGTH)
  } catch {
    return cleanText(value, MAX_SUMMARY_LENGTH)
  }
}

function parseChannelModelList(channel: Channel) {
  return String(channel.models || '')
    .split(/[,\n]/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function selectTestModel(channel: Channel, requestedModel: string | undefined) {
  const requested = requestedModel?.trim()
  if (requested) return requested
  const firstChannelModel = parseChannelModelList(channel)[0]
  if (firstChannelModel) return firstChannelModel
  return undefined
}

function normalizeText(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function protectedByText(value: unknown, rules: string[]) {
  const text = normalizeText(value)
  if (!text) return false
  return rules.some((rule) => {
    const next = normalizeText(rule)
    return next && text.includes(next)
  })
}

function protectedByDelimitedText(value: unknown, rules: string[]) {
  const parts = String(value || '')
    .split(/[,\n]/g)
    .map((item) => normalizeText(item))
    .filter(Boolean)

  if (!parts.length) return false

  return rules.some((rule) => {
    const next = normalizeText(rule)
    return next && parts.includes(next)
  })
}

function isProtectedChannel(channel: Channel, settings: OpsSettings) {
  const rules = settings.aiExecution.protectedChannels
  return (
    rules.ids.includes(channel.id) ||
    rules.types.includes(channel.type) ||
    protectedByDelimitedText(channel.group, rules.groups) ||
    protectedByDelimitedText(channel.tag, rules.tags) ||
    protectedByText(channel.name, rules.nameIncludes) ||
    protectedByText(channel.models, rules.modelIncludes)
  )
}

function hasChannelRemark(channel: Channel) {
  return Object.prototype.hasOwnProperty.call(channel, 'remark')
}

function readChannelRemark(channel: Channel) {
  return cleanChannelMemoryNote(channel.remark)
}

function syncMemoryFromChannel(
  previous: ChannelMemory | undefined,
  channel: Channel,
  settings: OpsSettings
) {
  const current = previous || defaultMemory(channel.id)
  const next: ChannelMemory = {
    ...current,
    channelName: channel.name || current.channelName,
    channelStatus: channel.status ?? current.channelStatus,
    protected: isProtectedChannel(channel, settings),
    manualNote: hasChannelRemark(channel)
      ? readChannelRemark(channel)
      : current.manualNote,
  }

  return (
    next.channelName === current.channelName &&
    next.channelStatus === current.channelStatus &&
    next.protected === current.protected &&
    next.manualNote === current.manualNote
  )
    ? current
    : { ...next, updatedAt: now() }
}

function syncMemoryStoreWithChannels(
  store: Record<string, ChannelMemory>,
  channels: Channel[],
  settings: OpsSettings
) {
  let changed = false
  const channelIds = new Set(channels.map((channel) => channel.id))

  for (const [key, memory] of Object.entries(store)) {
    if (channelIds.has(memory.channelId)) continue
    delete store[key]
    changed = true
  }

  for (const channel of channels) {
    const id = String(channel.id)
    const current = store[id]
    if (!current && (!hasChannelRemark(channel) || !readChannelRemark(channel))) {
      continue
    }

    const next = syncMemoryFromChannel(current, channel, settings)
    if (!current || next !== current) {
      store[id] = next
      changed = true
    }
  }

  return changed
}

async function loadChannelsForMemorySync(config?: AppConfig) {
  if (!config) return undefined

  try {
    return (await new NewApiClient(config.newApi).getChannels()).items
  } catch {
    return undefined
  }
}

function createRunId(channelId: number) {
  return `test-${channelId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
  const results: R[] = []
  let index = 0
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (index < items.length) {
        const current = index
        index += 1
        results[current] = await worker(items[current])
      }
    }
  )
  await Promise.all(workers)
  return results
}

async function runOneChannelTest(
  client: NewApiClient,
  channel: Channel,
  options: RunChannelTestsOptions
): Promise<ChannelTestRun> {
  const startedAt = now()
  const startedMs = Date.now()
  const model = selectTestModel(channel, options.model)

  try {
    const result = await client.testChannel(channel.id, model)
    const endedAt = now()
    return {
      id: createRunId(channel.id),
      channelId: channel.id,
      channelName: channel.name,
      channelStatus: channel.status,
      model,
      status: 'success',
      latencyMs: Math.max(0, Date.now() - startedMs),
      responseSummary: summarizeUnknown(result),
      triggeredBy: options.triggeredBy || 'manual',
      startedAt,
      endedAt,
    }
  } catch (error) {
    const endedAt = now()
    return {
      id: createRunId(channel.id),
      channelId: channel.id,
      channelName: channel.name,
      channelStatus: channel.status,
      model,
      status: 'failed',
      latencyMs: Math.max(0, Date.now() - startedMs),
      error: cleanText(error instanceof Error ? error.message : String(error), 500),
      triggeredBy: options.triggeredBy || 'manual',
      startedAt,
      endedAt,
    }
  }
}

function readRequestedIds(value: number[] | undefined) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map(Number)
        .filter((item) => Number.isInteger(item) && item > 0)
    ),
  ]
}

function selectChannels(
  channels: Channel[],
  requestedIds: number[],
  settings: OpsSettings
) {
  let candidates = channels
  if (requestedIds.length) {
    const ids = new Set(requestedIds)
    candidates = channels.filter((channel) => ids.has(channel.id))
  }

  return candidates.filter((channel) => !isProtectedChannel(channel, settings))
}

async function appendTestRuns(runs: ChannelTestRun[]) {
  appendChannelTestRuns(runs as unknown as Array<Record<string, unknown>>)
}

export async function getChannelTestHistory(options: {
  channelId?: number
  limit?: number
} = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 100), 1), 1000)
  return (listChannelTestRunRecords({
    channelId: options.channelId,
    limit,
  }) as ChannelTestRun[]).filter((item) =>
    options.channelId ? item.channelId === options.channelId : true
  )
}

async function pruneHistory(
  historyLimit: number,
  validChannelIds?: Set<number>
) {
  pruneChannelTestRuns(historyLimit, validChannelIds)
}

async function loadMemoryStore() {
  return Object.fromEntries(
    (loadChannelMemoryRecords() as ChannelMemory[]).map((memory) => [
      String(memory.channelId),
      memory,
    ])
  )
}

async function saveMemoryStore(store: Record<string, ChannelMemory>) {
  replaceChannelMemoryRecords(
    Object.values(store) as unknown as Array<Record<string, unknown>>
  )
}

function emptyTestSummary(): ChannelMemory['testSummary'] {
  return {
    total: 0,
    success: 0,
    failed: 0,
    successRate: 0,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
  }
}

function defaultMemory(channelId: number): ChannelMemory {
  return {
    channelId,
    manualNote: '',
    aiObservation: '',
    protected: false,
    testSummary: emptyTestSummary(),
    updatedAt: now(),
  }
}

function buildAiObservation(
  run: ChannelTestRun,
  consecutiveFailures: number
) {
  if (run.status === 'success') {
    const latency = run.latencyMs !== undefined ? `，延迟 ${run.latencyMs}ms` : ''
    return `最近主动测试成功${latency}。`
  }

  const prefix =
    consecutiveFailures > 1
      ? `连续 ${consecutiveFailures} 次主动测试失败`
      : '最近主动测试失败'
  return `${prefix}，最近错误：${run.error || '未返回明确错误'}。`
}

function updateMemoryFromRun(
  previous: ChannelMemory | undefined,
  run: ChannelTestRun,
  settings: OpsSettings
): ChannelMemory {
  const current = previous || defaultMemory(run.channelId)
  const success = current.testSummary.success + (run.status === 'success' ? 1 : 0)
  const failed = current.testSummary.failed + (run.status === 'failed' ? 1 : 0)
  const total = success + failed
  const consecutiveFailures =
    run.status === 'failed'
      ? current.testSummary.consecutiveFailures + 1
      : 0
  const consecutiveSuccesses =
    run.status === 'success'
      ? (current.testSummary.consecutiveSuccesses || 0) + 1
      : 0

  return {
    ...current,
    channelName: run.channelName || current.channelName,
    channelStatus: run.channelStatus ?? current.channelStatus,
    protected: settings.aiExecution.protectedChannels.ids.includes(run.channelId),
    aiObservation: buildAiObservation(run, consecutiveFailures),
    testSummary: {
      total,
      success,
      failed,
      successRate: total ? success / total : 0,
      consecutiveFailures,
      consecutiveSuccesses,
      lastStatus: run.status,
      lastLatencyMs: run.latencyMs,
      lastError: run.error,
      lastModel: run.model,
      lastTestedAt: run.endedAt,
    },
    updatedAt: run.endedAt,
  }
}

function memoryToPromptItem(memory: ChannelMemory): ChannelMemoryPromptItem {
  return {
    channelId: memory.channelId,
    channelName: memory.channelName,
    channelStatus: memory.channelStatus,
    manualNote: memory.manualNote || undefined,
    aiObservation: memory.aiObservation || undefined,
    protected: memory.protected,
    successRate: memory.testSummary.successRate,
    consecutiveFailures: memory.testSummary.consecutiveFailures,
    consecutiveSuccesses: memory.testSummary.consecutiveSuccesses,
    lastStatus: memory.testSummary.lastStatus,
    lastLatencyMs: memory.testSummary.lastLatencyMs,
    lastError: memory.testSummary.lastError,
    lastModel: memory.testSummary.lastModel,
    lastTestedAt: memory.testSummary.lastTestedAt,
  }
}

function sortMemoriesForPrompt(memories: ChannelMemory[]) {
  return [...memories].sort((a, b) => {
    const failureDelta =
      b.testSummary.consecutiveFailures - a.testSummary.consecutiveFailures
    if (failureDelta) return failureDelta

    const noteDelta = Number(Boolean(b.manualNote)) - Number(Boolean(a.manualNote))
    if (noteDelta) return noteDelta

    return (
      new Date(b.testSummary.lastTestedAt || b.updatedAt).getTime() -
      new Date(a.testSummary.lastTestedAt || a.updatedAt).getTime()
    )
  })
}

export function buildChannelMemoryPromptSummary(
  memories: ChannelMemory[],
  limit = 30
) {
  return sortMemoriesForPrompt(memories)
    .filter((memory) => {
      return (
        memory.manualNote ||
        memory.aiObservation ||
        memory.testSummary.total > 0
      )
    })
    .slice(0, limit)
    .map(memoryToPromptItem)
}

function syncProtectionSnapshot(
  memory: ChannelMemory,
  settings: OpsSettings
): ChannelMemory {
  const nextProtected = settings.aiExecution.protectedChannels.ids.includes(
    memory.channelId
  )
  return memory.protected === nextProtected
    ? memory
    : { ...memory, protected: nextProtected }
}

export async function listChannelMemories(settings?: OpsSettings) {
  const effectiveSettings = settings || (await loadOpsSettings())
  const store = await loadMemoryStore()
  return Object.values(store)
    .map((memory) => syncProtectionSnapshot(memory, effectiveSettings))
    .sort((a, b) => a.channelId - b.channelId)
}

export async function listSyncedChannelMemories(
  config?: AppConfig,
  settings?: OpsSettings
) {
  const effectiveSettings = settings || (await loadOpsSettings())
  const store = await loadMemoryStore()
  const channels = await loadChannelsForMemorySync(config)
  const channelById = new Map(
    (channels || []).map((channel) => [channel.id, channel] as const)
  )

  if (channels && syncMemoryStoreWithChannels(store, channels, effectiveSettings)) {
    await saveMemoryStore(store)
  }

  return Object.values(store)
    .filter((memory) =>
      channels ? channelById.has(memory.channelId) : true
    )
    .map((memory) => {
      const channel = channelById.get(memory.channelId)
      return channel
        ? syncMemoryFromChannel(memory, channel, effectiveSettings)
        : syncProtectionSnapshot(memory, effectiveSettings)
    })
    .sort((a, b) => a.channelId - b.channelId)
}

export async function getChannelMemory(
  channelId: number,
  settings?: OpsSettings,
  channel?: Channel
) {
  const effectiveSettings = settings || (await loadOpsSettings())
  const store = await loadMemoryStore()
  const current = store[String(channelId)] || defaultMemory(channelId)
  const memory = channel
    ? syncMemoryFromChannel(current, channel, effectiveSettings)
    : syncProtectionSnapshot(current, effectiveSettings)

  if (channel && memory !== current) {
    store[String(channelId)] = memory
    await saveMemoryStore(store)
  }

  return memory
}

export async function saveChannelMemory(
  channelId: number,
  input: unknown,
  settings?: OpsSettings,
  channel?: Channel
) {
  const effectiveSettings = settings || (await loadOpsSettings())
  const store = await loadMemoryStore()
  const current = store[String(channelId)] || defaultMemory(channelId)
  const manualNote = isRecord(input)
    ? cleanChannelMemoryNote(input.manualNote)
    : current.manualNote
  const base = channel
    ? syncMemoryFromChannel(current, channel, effectiveSettings)
    : syncProtectionSnapshot(current, effectiveSettings)
  const next: ChannelMemory = {
    ...base,
    manualNote,
    updatedAt: now(),
  }
  store[String(channelId)] = next
  await saveMemoryStore(store)
  return next
}

async function updateMemoriesFromRuns(
  runs: ChannelTestRun[],
  settings: OpsSettings,
  channels?: Channel[]
) {
  const store = await loadMemoryStore()
  const updated: ChannelMemory[] = []
  const synced = channels
    ? syncMemoryStoreWithChannels(store, channels, settings)
    : false

  for (const run of runs) {
    const id = String(run.channelId)
    const next = updateMemoryFromRun(store[id], run, settings)
    store[id] = next
    updated.push(next)
  }

  if (runs.length || synced) {
    await saveMemoryStore(store)
  }
  return updated
}

export async function runChannelTests(
  config: AppConfig,
  options: RunChannelTestsOptions = {}
): Promise<RunChannelTestsResult> {
  const settings = await loadOpsSettings()
  const client = new NewApiClient(config.newApi)
  const channelData = await client.getChannels()
  const requestedIds = readRequestedIds(options.channelIds)
  const selectedChannels = selectChannels(channelData.items, requestedIds, settings)
  const runs = await mapWithConcurrency(
    selectedChannels,
    settings.activeTesting.concurrency,
    (channel) => runOneChannelTest(client, channel, options)
  )

  await appendTestRuns(runs)
  await pruneHistory(
    settings.activeTesting.historyLimit,
    new Set(channelData.items.map((channel) => channel.id))
  )
  const memories = await updateMemoriesFromRuns(runs, settings, channelData.items)

  return {
    runs,
    memories,
    memorySummary: buildChannelMemoryPromptSummary(memories),
  }
}

export async function getChannelMemoryPromptSummary(
  configOrLimit?: AppConfig | number,
  limit = 30
) {
  const config = typeof configOrLimit === 'number' ? undefined : configOrLimit
  const effectiveLimit =
    typeof configOrLimit === 'number' ? configOrLimit : limit
  return buildChannelMemoryPromptSummary(
    await listSyncedChannelMemories(config),
    effectiveLimit
  )
}
