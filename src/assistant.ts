import type { AppConfig } from './config'
import type { RawAction } from './actions'
import {
  loadEffectiveLlmConfig,
  loadOpsSettings,
  type OpsSettings,
  type PromptKeywordSnippet,
} from './settings'
import { getChannelMemoryPromptSummary } from './testing'
import { NewApiClient } from './newapi/client'
import { logger } from './logger'
import type {
  Channel,
  ChannelMemoryPromptItem,
  LogStats,
  UsageLog,
} from './types/domain'

export type AssistantMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type AssistantTurnPlan = {
  userMessage: AssistantMessage
  assistantMessage: AssistantMessage
  rawActions: RawAction[]
  missingFields: string[]
  secrets: AssistantSecret[]
  memorySummary: ChannelMemoryPromptItem[]
}

export type AssistantPreparedTurn = {
  userMessage: AssistantMessage
  redactedInput: string
  redacted: RedactionResult
  secrets: AssistantSecret[]
}

export type AssistantResponseOptions = {
  assistantMessage?: AssistantMessage
  userMessageId?: string
  onReplyDelta?: (delta: string) => void | Promise<void>
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

type ChatCompletionStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string
    }
    message?: {
      content?: string
    }
  }>
}

export type AssistantSecret = {
  kind: 'apiKey' | 'authorization' | 'cookie'
  placeholder: string
  value: string
}

type RedactionResult = {
  text: string
  secrets: AssistantSecret[]
}

type AssistantPlan = {
  reply: string
  rawActions: RawAction[]
  missingFields: string[]
}

const MAX_HISTORY_MESSAGES = 12
const MAX_MESSAGE_LENGTH = 6000
const LOG_TYPE_CONSUME = 2
const LOG_TYPE_ERROR = 5

const CORE_ASSISTANT_SYSTEM_PROMPT = [
  '你是 new-api AI 运维助手，负责把自然语言整理成动作草稿。',
  '你只能返回 JSON，不要返回 Markdown。',
  'JSON 结构: {"reply":"给操作者的中文回复","missing_fields":[],"proposed_actions":[]}',
  'proposed_actions 只允许 create_channel、test_channel、update_channel、disable_channel、delete_channel；其他请求只回复说明，不要生成动作。',
  '不要泄露、复述或猜测任何密钥、Authorization、Cookie；只能使用后端提供的占位符。',
  '删除渠道只能生成动作草案，必须 requires_confirm=true，不能声称会自动执行。',
  '你只能提出动作草稿，不能声称已经执行；实际执行状态由后端权限、确认策略、保护规则和动作队列决定。',
].join('\n')

function buildAssistantSystemPrompt(assistantInstructions: string) {
  const custom = assistantInstructions.trim()
  return custom
    ? `${CORE_ASSISTANT_SYSTEM_PROMPT}\n\n可编辑助手提示词:\n${custom}`
    : CORE_ASSISTANT_SYSTEM_PROMPT
}

function now() {
  return new Date().toISOString()
}

export function createAssistantMessage(
  role: AssistantMessage['role'],
  content: string,
  id?: string
): AssistantMessage {
  return {
    id: id || `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: now(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function addSecret(
  secrets: AssistantSecret[],
  kind: AssistantSecret['kind'],
  value: string
) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const existing = secrets.find((secret) => secret.value === trimmed)
  if (existing) return existing.placeholder

  const count = secrets.filter((secret) => secret.kind === kind).length + 1
  const placeholder = `[${kind === 'apiKey' ? 'API_KEY' : kind.toUpperCase()}_${count}]`
  secrets.push({ kind, value: trimmed, placeholder })
  return placeholder
}

export function redactAssistantInput(
  input: string,
  knownSecrets: AssistantSecret[] = []
): RedactionResult {
  const secrets: AssistantSecret[] = [...knownSecrets]
  let text = input.slice(0, MAX_MESSAGE_LENGTH)

  text = text.replace(
    /(authorization\s*(?:[:：=]\s*)?)(Bearer\s+[A-Za-z0-9._~+/=-]+)/gi,
    (_, prefix: string, value: string) =>
      `${prefix}${addSecret(secrets, 'authorization', value)}`
  )

  text = text.replace(
    /(cookie\s*[:：=]\s*)([^\n]+)/gi,
    (_, prefix: string, value: string) =>
      `${prefix}${addSecret(secrets, 'cookie', value)}`
  )

  text = text.replace(
    /((?:api[_\s-]?key|密钥|key)\s*[:：=]\s*)([^\s,，;；]+)/gi,
    (_, prefix: string, value: string) =>
      `${prefix}${addSecret(secrets, 'apiKey', value)}`
  )

  text = text.replace(
    /((?:api[_\s-]?key|密钥|key)\s+)([A-Za-z0-9._~+/=-]{8,})/gi,
    (_, prefix: string, value: string) =>
      `${prefix}${addSecret(secrets, 'apiKey', value)}`
  )

  text = text.replace(
    /\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9._-]{12,}\b/g,
    (value) => addSecret(secrets, 'apiKey', value)
  )

  return {
    text,
    secrets,
  }
}

export function prepareAssistantTurn(
  input: string,
  knownSecrets: AssistantSecret[] = [],
  options: AssistantResponseOptions = {}
): AssistantPreparedTurn {
  const redacted = redactAssistantInput(input, knownSecrets)
  const userMessage = createAssistantMessage(
    'user',
    redacted.text,
    options.userMessageId
  )

  return {
    userMessage,
    redactedInput: redacted.text,
    redacted,
    secrets: redacted.secrets,
  }
}

export async function planAssistantTurn(
  config: AppConfig,
  history: AssistantMessage[],
  input: string,
  knownSecrets: AssistantSecret[] = []
): Promise<AssistantTurnPlan> {
  const prepared = prepareAssistantTurn(input, knownSecrets)
  return planAssistantResponse(config, history, prepared)
}

export async function planAssistantResponse(
  config: AppConfig,
  history: AssistantMessage[],
  prepared: AssistantPreparedTurn,
  options: AssistantResponseOptions = {}
): Promise<AssistantTurnPlan> {
  const llm = await loadEffectiveLlmConfig(config)
  const settings = await loadOpsSettings()
  const memorySummary = settings.context.enabled && settings.context.includeChannelMemory
    ? await getChannelMemoryPromptSummary(config)
    : []
  const runtimeContext = llm.apiKey
    ? await collectAssistantRuntimeContext(config, settings.context)
    : undefined
  const planned = llm.apiKey
    ? (await planWithLlm(
        llm,
        history,
        prepared.redactedInput,
        settings.prompt.assistantInstructions,
        settings.prompt.keywordSnippets,
        memorySummary,
        runtimeContext,
        options
      ).catch(() =>
        assistantUnavailablePlan()
      )) ?? assistantUnavailablePlan()
    : assistantNotConfiguredPlan()
  const finalized = finalizePlan(planned, prepared.redacted)
  const reply =
    finalized.missingFields.length &&
    finalized.rawActions.length === 0 &&
    planned.rawActions.length > 0
      ? validationFailedReply(finalized.missingFields, planned.reply)
      : finalized.reply
  const assistantMessage = options.assistantMessage
    ? { ...options.assistantMessage, content: reply }
    : createAssistantMessage('assistant', reply)

  return {
    userMessage: prepared.userMessage,
    assistantMessage,
    rawActions: finalized.rawActions,
    missingFields: finalized.missingFields,
    secrets: prepared.secrets,
    memorySummary,
  }
}

async function planWithLlm(
  llm: AppConfig['llm'],
  history: AssistantMessage[],
  sanitizedInput: string,
  assistantInstructions: string,
  keywordSnippets: PromptKeywordSnippet[],
  memorySummary: ChannelMemoryPromptItem[],
  runtimeContext: Record<string, unknown> | undefined,
  options: AssistantResponseOptions = {}
): Promise<AssistantPlan | undefined> {
  const matchedKeywordSnippets = matchKeywordSnippets(
    sanitizedInput,
    keywordSnippets
  )
  const messages = buildChatMessages(
    history,
    sanitizedInput,
    assistantInstructions,
    matchedKeywordSnippets,
    memorySummary,
    runtimeContext
  )

  if (options.onReplyDelta) {
    return planWithLlmStream(llm, messages, options.onReplyDelta)
  }

  const response = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey}`,
    },
    body: JSON.stringify({
      model: llm.model,
      messages,
      temperature: llm.temperature,
      response_format: { type: 'json_object' },
    }),
  })

  const text = await response.text()
  if (!response.ok) return undefined

  return parseChatCompletionText(text)
}

function buildChatMessages(
  history: AssistantMessage[],
  sanitizedInput: string,
  assistantInstructions: string,
  matchedKeywordSnippets: PromptKeywordSnippet[],
  memorySummary: ChannelMemoryPromptItem[],
  runtimeContext: Record<string, unknown> | undefined
): ChatMessage[] {
  const keywordMessages: ChatMessage[] = matchedKeywordSnippets.length
    ? [
        {
          role: 'system',
          content: `命中的关键词提示片段（来自设置页；当用户请求缺少固定字段时，优先使用这些片段补全，但不要覆盖用户显式提供的新值）：\n${JSON.stringify(matchedKeywordSnippets.map(snippetForPrompt), null, 2)}`,
        },
      ]
    : []
  const memoryMessages: ChatMessage[] = memorySummary.length
    ? [
        {
          role: 'system',
          content: `渠道记忆摘要（manualNote 来自同步后的 new-api remark，优先级最高；不能覆盖，只能参考或建议更新）：\n${JSON.stringify(memorySummary, null, 2)}`,
        },
      ]
    : []
  const runtimeMessages: ChatMessage[] = runtimeContext
    ? [
        {
          role: 'system',
          content: `当前 new-api 实时上下文（来自管理 API，按设置页开关与数量上限裁剪；只能作为当前状态参考，动作仍需后端权限与确认策略校验）：\n${JSON.stringify(runtimeContext, null, 2)}`,
        },
      ]
    : []

  return [
    {
      role: 'system',
      content: buildAssistantSystemPrompt(assistantInstructions),
    },
    ...keywordMessages,
    ...memoryMessages,
    ...runtimeMessages,
    ...history.slice(-MAX_HISTORY_MESSAGES).map((item) => ({
      role: item.role,
      content: item.content,
    })),
    { role: 'user', content: sanitizedInput },
  ]
}

function matchKeywordSnippets(
  input: string,
  snippets: PromptKeywordSnippet[] = []
) {
  const text = input.toLowerCase()
  return snippets
    .filter((snippet) => {
      if (!snippet.enabled || !snippet.content.trim()) return false
      return snippet.keywords.some((keyword) => {
        const normalized = keyword.trim().toLowerCase()
        return normalized && text.includes(normalized)
      })
    })
    .slice(0, 10)
}

function snippetForPrompt(snippet: PromptKeywordSnippet) {
  return {
    name: snippet.name,
    keywords: snippet.keywords,
    content: snippet.content,
  }
}

async function collectAssistantRuntimeContext(
  config: AppConfig,
  options: OpsSettings['context']
) {
  if (!options.enabled) return undefined

  const end = Math.floor(Date.now() / 1000)
  const start = end - Math.max(1, config.newApi.logHours) * 60 * 60
  const needsChannels = options.includeChannelSummary || options.includeChannelDetails
  const needsLogs =
    options.includeRecentLogs || options.includeLogStats || options.includeModels
  const needsStats = options.includeLogStats
  const client = new NewApiClient(config.newApi)
  const [channelResult, logResult, statsResult] = await Promise.allSettled([
    needsChannels ? client.getChannels() : Promise.resolve(undefined),
    needsLogs ? client.getRecentLogs(start, end) : Promise.resolve(undefined),
    needsStats ? client.getLogStats(start, end) : Promise.resolve({} as LogStats),
  ])

  const context: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    window: {
      start: new Date(start * 1000).toISOString(),
      end: new Date(end * 1000).toISOString(),
      hours: config.newApi.logHours,
    },
  }

  const channels =
    channelResult.status === 'fulfilled' ? channelResult.value?.items || [] : []
  const logs = logResult.status === 'fulfilled' ? logResult.value?.items || [] : []
  const stats = statsResult.status === 'fulfilled' ? statsResult.value || {} : {}

  if (channelResult.status === 'rejected') {
    logger.warn('failed to load assistant channel context', channelResult.reason)
    context.channelContextUnavailable = assistantContextErrorMessage(channelResult.reason)
  }

  if (logResult.status === 'rejected') {
    logger.warn('failed to load assistant log context', logResult.reason)
    context.logContextUnavailable = assistantContextErrorMessage(logResult.reason)
  }

  if (statsResult.status === 'rejected') {
    logger.warn('failed to load assistant log stats context', statsResult.reason)
    context.logStatsContextUnavailable = assistantContextErrorMessage(statsResult.reason)
  }

  if (options.includeChannelSummary && channelResult.status === 'fulfilled') {
    context.channelSummary = buildAssistantChannelSummary(channels)
  }

  if (options.includeChannelDetails && channelResult.status === 'fulfilled') {
    context.channels = {
      total: channels.length,
      returned: Math.min(channels.length, options.maxChannels),
      truncated: channels.length > options.maxChannels,
      items: channels
        .slice()
        .sort((a, b) => a.id - b.id)
        .slice(0, options.maxChannels)
        .map((channel) => summarizeChannelForAssistant(channel, options)),
    }
  }

  if (options.includeLogStats && logResult.status === 'fulfilled') {
    context.logSummary = buildAssistantLogSummary(logs, stats)
  }

  if (options.includeRecentLogs && logResult.status === 'fulfilled') {
    context.recentLogs = {
      totalFromApi:
        logResult.status === 'fulfilled'
          ? logResult.value?.total || logs.length
          : logs.length,
      returned: Math.min(logs.length, options.maxLogs),
      truncated: logs.length > options.maxLogs,
      items: logs.slice(0, options.maxLogs).map(summarizeLogForAssistant),
    }
  }

  if (options.includeModels && logResult.status === 'fulfilled') {
    context.topModels = buildTopModelsForAssistant(logs)
  }

  return context
}

function buildAssistantChannelSummary(channels: Channel[]) {
  const statusCounts = new Map<number, number>()
  const typeCounts = new Map<number, number>()
  for (const channel of channels) {
    statusCounts.set(channel.status, (statusCounts.get(channel.status) || 0) + 1)
    typeCounts.set(channel.type, (typeCounts.get(channel.type) || 0) + 1)
  }

  return {
    total: channels.length,
    enabled: statusCounts.get(1) || 0,
    manuallyDisabled: statusCounts.get(0) || 0,
    autoDisabled: statusCounts.get(2) || 0,
    statusCounts: Object.fromEntries(
      [...statusCounts.entries()].map(([status, count]) => [
        channelStatusLabel(status),
        count,
      ])
    ),
    typeCounts: Object.fromEntries(
      [...typeCounts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([type, count]) => [String(type), count])
    ),
  }
}

function summarizeChannelForAssistant(
  channel: Channel,
  options: OpsSettings['context']
) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    status: channel.status,
    statusLabel: channelStatusLabel(channel.status),
    group: channel.group,
    tag: channel.tag,
    models: channel.models,
    baseUrl: channel.base_url,
    remark: channel.remark,
    priority: channel.priority,
    weight: channel.weight,
    autoBan: channel.auto_ban,
    ...(options.includeLatency
      ? {
          responseTimeMs: numericOrUndefined(channel.response_time),
          testTime: channel.test_time,
        }
      : {}),
    ...(options.includeBalance
      ? {
          balance: numericOrUndefined(channel.balance),
          usedQuota: numericOrUndefined(channel.used_quota),
          balanceUpdatedTime: channel.balance_updated_time,
        }
      : {}),
  }
}

function buildAssistantLogSummary(logs: UsageLog[], stats: LogStats) {
  const success = logs.filter((log) => log.type === LOG_TYPE_CONSUME).length
  const errors = logs.filter((log) => log.type === LOG_TYPE_ERROR).length
  const effective = success + errors

  return {
    observed: logs.length,
    success,
    errors,
    failureRate: effective ? errors / effective : 0,
    rpm: stats.rpm,
    tpm: stats.tpm,
    quota: stats.quota,
    topErrorChannels: buildTopErrorChannelsForAssistant(logs),
  }
}

function summarizeLogForAssistant(log: UsageLog) {
  return {
    id: log.id,
    createdAt: log.created_at
      ? new Date(log.created_at * 1000).toISOString()
      : undefined,
    type: log.type,
    typeLabel: logTypeLabel(log.type),
    channelId: log.channel,
    channelName: log.channel_name,
    model: log.model_name,
    group: log.group,
    quota: log.quota,
    promptTokens: log.prompt_tokens,
    completionTokens: log.completion_tokens,
    latencyMs: log.use_time,
    isStream: log.is_stream,
    content: cleanAssistantContextText(log.content, 300),
  }
}

function buildTopErrorChannelsForAssistant(logs: UsageLog[]) {
  const grouped = new Map<string, { channelId?: number; channelName?: string | null; count: number; sample?: string }>()
  for (const log of logs.filter((item) => item.type === LOG_TYPE_ERROR)) {
    const key = String(log.channel || log.channel_name || 'unknown')
    const item = grouped.get(key) || {
      channelId: log.channel,
      channelName: log.channel_name,
      count: 0,
      sample: undefined,
    }
    item.count += 1
    item.sample ||= cleanAssistantContextText(log.content, 180)
    grouped.set(key, item)
  }

  return [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 10)
}

function buildTopModelsForAssistant(logs: UsageLog[]) {
  const grouped = new Map<string, { model: string; count: number; errors: number }>()
  for (const log of logs) {
    const model = log.model_name?.trim() || 'unknown'
    const item = grouped.get(model) || { model, count: 0, errors: 0 }
    item.count += 1
    if (log.type === LOG_TYPE_ERROR) item.errors += 1
    grouped.set(model, item)
  }

  return [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 15)
}

function cleanAssistantContextText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return undefined
  return String(value)
    .trim()
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9._-]{12,}\b/g, '[REDACTED]')
    .replace(
      /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      '[REDACTED]'
    )
    .slice(0, maxLength)
}

function assistantContextErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function numericOrUndefined(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function channelStatusLabel(status: number) {
  if (status === 1) return 'enabled'
  if (status === 2) return 'auto_disabled'
  if (status === 0) return 'disabled'
  return String(status)
}

function logTypeLabel(type: number) {
  if (type === LOG_TYPE_CONSUME) return 'consume'
  if (type === LOG_TYPE_ERROR) return 'error'
  return String(type)
}

async function planWithLlmStream(
  llm: AppConfig['llm'],
  messages: ChatMessage[],
  onReplyDelta: (delta: string) => void | Promise<void>
): Promise<AssistantPlan | undefined> {
  const response = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey}`,
    },
    body: JSON.stringify({
      model: llm.model,
      messages,
      temperature: llm.temperature,
      response_format: { type: 'json_object' },
      stream: true,
    }),
  })

  if (!response.ok) {
    await response.text().catch(() => '')
    return undefined
  }

  const body = response.body
  if (!body) {
    const text = await response.text()
    return parseChatCompletionText(text)
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let sseBuffer = ''
  let rawText = ''
  let content = ''
  let emittedReply = ''

  const emitReplyFromContent = async () => {
    const reply = extractPartialJsonStringField(content, 'reply')
    if (reply === undefined) return
    if (!reply.startsWith(emittedReply)) return
    const delta = reply.slice(emittedReply.length)
    if (!delta) return
    emittedReply = reply
    await onReplyDelta(delta)
  }

  const handleData = async (data: string) => {
    if (!data || data === '[DONE]') return

    let parsed: ChatCompletionStreamChunk
    try {
      parsed = JSON.parse(data) as ChatCompletionStreamChunk
    } catch {
      return
    }

    const delta = parsed.choices
      ?.map((choice) => choice.delta?.content || choice.message?.content || '')
      .join('')

    if (!delta) return
    content += delta
    await emitReplyFromContent()
  }

  const handleBlock = async (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart())
      .join('\n')
      .trim()

    await handleData(data)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    rawText += chunk
    sseBuffer += chunk

    const blocks = sseBuffer.split(/\r?\n\r?\n/)
    sseBuffer = blocks.pop() || ''
    for (const block of blocks) {
      await handleBlock(block)
    }
  }

  const tail = decoder.decode()
  if (tail) {
    rawText += tail
    sseBuffer += tail
  }

  if (sseBuffer.trim()) {
    await handleBlock(sseBuffer)
  }

  const streamedPlan = content ? parseAssistantJson(content) : undefined
  if (streamedPlan) {
    if (streamedPlan.reply.startsWith(emittedReply)) {
      const delta = streamedPlan.reply.slice(emittedReply.length)
      if (delta) await onReplyDelta(delta)
    }
    return streamedPlan
  }

  const directPlan = parseChatCompletionText(rawText) || parseAssistantJson(rawText)
  if (directPlan?.reply) {
    await onReplyDelta(directPlan.reply)
  }
  return directPlan
}

function parseChatCompletionText(text: string): AssistantPlan | undefined {
  let json: ChatCompletionResponse
  try {
    json = JSON.parse(text) as ChatCompletionResponse
  } catch {
    return undefined
  }

  const content = json.choices?.[0]?.message?.content?.trim()
  return content ? parseAssistantJson(content) : undefined
}

function parseAssistantJson(content: string): AssistantPlan | undefined {
  const block = extractJsonObject(content)
  if (!block) return undefined

  const parsed = JSON.parse(block) as unknown
  if (!isRecord(parsed)) return undefined

  return {
    reply:
      typeof parsed.reply === 'string'
        ? parsed.reply.trim()
        : '我已经整理了你的请求。',
    rawActions: readRawActions(parsed.proposed_actions),
    missingFields: readStringList(parsed.missing_fields),
  }
}

function extractPartialJsonStringField(content: string, fieldName: string) {
  const fieldPattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:`)
  const fieldMatch = fieldPattern.exec(content)
  if (!fieldMatch) return undefined

  let index = fieldMatch.index + fieldMatch[0].length
  while (/\s/.test(content[index] || '')) index += 1
  if (content[index] !== '"') return undefined

  index += 1
  let result = ''

  while (index < content.length) {
    const char = content[index]

    if (char === '"') return result

    if (char !== '\\') {
      result += char
      index += 1
      continue
    }

    const escaped = content[index + 1]
    if (!escaped) return result

    if (escaped === 'u') {
      const hex = content.slice(index + 2, index + 6)
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return result
      result += String.fromCharCode(Number.parseInt(hex, 16))
      index += 6
      continue
    }

    result += decodeJsonEscape(escaped)
    index += 2
  }

  return result
}

function decodeJsonEscape(value: string) {
  if (value === 'n') return '\n'
  if (value === 'r') return '\r'
  if (value === 't') return '\t'
  if (value === 'b') return '\b'
  if (value === 'f') return '\f'
  return value
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function assistantNotConfiguredPlan(): AssistantPlan {
  return {
    reply:
      'AI 助手需要先配置 LLM_API_KEY 才能理解自然语言。我不会用本地规则猜测你的意图；配置完成后再发送这条请求即可。',
    rawActions: [],
    missingFields: [],
  }
}

function assistantUnavailablePlan(): AssistantPlan {
  return {
    reply:
      '这次 AI 理解没有成功，可能是 LLM 服务暂时不可用或返回格式异常。我没有生成动作，请稍后重试。',
    rawActions: [],
    missingFields: [],
  }
}

function validationFailedReply(fields: string[], originalReply: string) {
  const prefix = originalReply.trim()
  const suffix = `后端安全校验发现缺少：${fields.join('、')}。我没有生成动作，请补充后再确认。`
  return prefix ? `${prefix}\n\n${suffix}` : suffix
}

function extractJsonObject(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  return content.slice(start, end + 1)
}

function readRawActions(value: unknown): RawAction[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord)
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(String).map((item) => item.trim()).filter(Boolean)
}

function finalizePlan(plan: AssistantPlan, redacted: RedactionResult): AssistantPlan {
  const rawActions: RawAction[] = []
  const missingFields = new Set(plan.missingFields)

  for (const rawAction of plan.rawActions) {
    const restored = restorePlaceholders(rawAction, redacted.secrets) as RawAction
    const action = normalizeRawActionName(restored.action)

    if (action === 'create_channel') {
      const channel = ensureCreateChannelPayload(restored)
      const apiKey = redacted.secrets.find((secret) => secret.kind === 'apiKey')
      if (!channel.key && apiKey) channel.key = apiKey.value

      const createMissing = [
        !stringValue(channel.base_url) ? '调用地址/base_url' : '',
        !stringValue(channel.key) ? 'API Key' : '',
        !stringValue(channel.models) ? '模型列表/models' : '',
      ].filter(Boolean)

      if (createMissing.length) {
        createMissing.forEach((field) => missingFields.add(field))
        continue
      }
    }

    if (
      ['test_channel', 'update_channel', 'disable_channel', 'delete_channel'].includes(action) &&
      !extractRawChannelId(restored)
    ) {
      missingFields.add('渠道名称或可定位信息')
      continue
    }

    rawActions.push(restored)
  }

  return {
    ...plan,
    rawActions,
    missingFields: [...missingFields],
  }
}

function restorePlaceholders(value: unknown, secrets: AssistantSecret[]): unknown {
  if (typeof value === 'string') {
    return secrets.reduce(
      (text, secret) => text.split(secret.placeholder).join(secret.value),
      value
    )
  }

  if (Array.isArray(value)) {
    return value.map((item) => restorePlaceholders(item, secrets))
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        restorePlaceholders(item, secrets),
      ])
    )
  }

  return value
}

function normalizeRawActionName(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['add_channel'].includes(normalized)) return 'create_channel'
  if (['check_channel', 'channel_test', 'test_channel_model'].includes(normalized)) {
    return 'test_channel'
  }
  if (['update_channel_note', 'update_note', 'remark_channel'].includes(normalized)) {
    return 'update_channel'
  }
  return normalized
}

function ensureCreateChannelPayload(raw: RawAction) {
  const payload = isRecord(raw.payload) ? { ...raw.payload } : {}
  const channel = isRecord(payload.channel)
    ? { ...payload.channel }
    : isRecord(raw.channel)
      ? { ...raw.channel }
      : {}

  payload.channel = channel
  raw.payload = payload
  return channel
}

function extractRawChannelId(raw: RawAction) {
  if (typeof raw.channel_id === 'number') return raw.channel_id
  if (typeof raw.channelId === 'number') return raw.channelId
  return extractChannelId(
    [raw.channel_id, raw.channelId, raw.target]
      .filter((item) => item !== undefined)
      .map(String)
      .join(' ')
  )
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : String(value || '').trim()
}

function extractChannelId(text: string) {
  const match =
    text.match(/(?:渠道|channel)\s*[:#：=]?\s*(\d+)/i) ||
    text.match(/#\s*(\d+)/) ||
    text.match(/\bid\s*[:：=]\s*(\d+)/i)
  return match ? Number(match[1]) : undefined
}
