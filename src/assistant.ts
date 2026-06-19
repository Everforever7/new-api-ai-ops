import type { AppConfig } from './config'
import type { RawAction } from './actions'
import { loadEffectiveLlmConfig } from './settings'

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

const ASSISTANT_SYSTEM_PROMPT = [
  '你是 new-api AI 运维助手，负责把自然语言整理成安全的动作草稿。',
  '你只能返回 JSON，不要返回 Markdown。',
  'JSON 结构: {"reply":"给操作者的中文回复","missing_fields":[],"proposed_actions":[]}',
  'proposed_actions 只允许 create_channel、test_channel、update_channel，其他请求只回复说明，不要生成动作。',
  '删除渠道不是可执行目标；用户要求删除时 reply 说明当前保持 never，不要生成动作。',
  '创建渠道动作格式: {"action":"create_channel","target":"渠道名称","risk":"medium","requires_confirm":true,"reason":"原因","payload":{"mode":"single","channel":{"name":"名称","type":1,"key":"[API_KEY_1]","base_url":"https://...","models":"model-a,model-b","group":"default","priority":0,"weight":0,"remark":"可选备注"}}}',
  '测试渠道动作格式: {"action":"test_channel","target":"channel:12","channel_id":12,"risk":"low","requires_confirm":true,"reason":"原因","payload":{"model":"可选模型"}}。',
  '更新备注动作格式: {"action":"update_channel","target":"channel:12","channel_id":12,"risk":"medium","requires_confirm":true,"reason":"原因","payload":{"remark":"备注内容"}}。',
  '创建渠道必须有 base_url、key、models；如果缺字段，只追问，不要编造，也不要生成 create_channel。',
  '模型名没有固定前缀，mimo-v2.5-pro、mimo-v2.5、provider/model、custom-001 都可能是合法模型。用户在“模型/支持模型/models”附近给出的逗号、顿号、空格分隔值都应视作模型列表。',
  '输入里的密钥、Authorization、Cookie 会以 [API_KEY_1] 这类占位符出现，你必须只保留占位符，不要要求用户重复明文密钥。',
  '如果用户分多轮补充信息，你可以结合最近对话上下文生成完整动作；例如上一轮已有 [API_KEY_1] 和 base_url，本轮只补模型时，可以使用 [API_KEY_1]。',
  'create_channel 的 payload.channel.key 必须使用密钥占位符，例如 [API_KEY_1]，不能写明文。',
  '所有动作都只是草稿，最终执行会进入权限、确认和保护规则；回复中要提醒用户去动作队列确认。',
].join('\n')

function now() {
  return new Date().toISOString()
}

function message(role: AssistantMessage['role'], content: string): AssistantMessage {
  return {
    id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

export async function planAssistantTurn(
  config: AppConfig,
  history: AssistantMessage[],
  input: string,
  knownSecrets: AssistantSecret[] = []
): Promise<AssistantTurnPlan> {
  const redacted = redactAssistantInput(input, knownSecrets)
  const llm = await loadEffectiveLlmConfig(config)
  const planned = llm.apiKey
    ? (await planWithLlm(llm, history, redacted.text).catch(() =>
        assistantUnavailablePlan()
      )) ?? assistantUnavailablePlan()
    : assistantNotConfiguredPlan()
  const finalized = finalizePlan(planned, redacted)
  const reply =
    finalized.missingFields.length &&
    finalized.rawActions.length === 0 &&
    planned.rawActions.length > 0
      ? validationFailedReply(finalized.missingFields, planned.reply)
      : finalized.reply

  return {
    userMessage: message('user', redacted.text),
    assistantMessage: message('assistant', reply),
    rawActions: finalized.rawActions,
    missingFields: finalized.missingFields,
    secrets: redacted.secrets,
  }
}

async function planWithLlm(
  llm: AppConfig['llm'],
  history: AssistantMessage[],
  sanitizedInput: string
): Promise<AssistantPlan | undefined> {
  const messages: ChatMessage[] = [
    { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
    ...history.slice(-MAX_HISTORY_MESSAGES).map((item) => ({
      role: item.role,
      content: item.content,
    })),
    { role: 'user', content: sanitizedInput },
  ]

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

  const json = JSON.parse(text) as ChatCompletionResponse
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) return undefined

  return parseAssistantJson(content)
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

    if (action === 'delete_channel') {
      continue
    }

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
      ['test_channel', 'update_channel', 'disable_channel'].includes(action) &&
      !extractRawChannelId(restored)
    ) {
      missingFields.add('渠道 ID')
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
