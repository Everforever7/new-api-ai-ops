import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AppConfig } from './config'
import type { Channel, ChannelMemory, HealthSnapshot } from './types/domain'
import { NewApiClient } from './newapi/client'
import { loadOpsSettings, type OpsSettings } from './settings'
import { logger } from './logger'
import { saveChannelMemory } from './testing'

export type ActionStatus =
  | 'queued'
  | 'pending_confirmation'
  | 'executing'
  | 'executed'
  | 'blocked'
  | 'failed'
  | 'rejected'

export type OpsAction = {
  id: string
  action: string
  rawAction: string
  source?: 'report' | 'assistant' | 'active_test'
  reportName?: string
  target?: string
  channelId?: number
  channelName?: string
  risk: 'low' | 'medium' | 'high'
  requiresConfirm: boolean
  reason: string
  payload?: Record<string, unknown>
  status: ActionStatus
  statusReason?: string
  result?: unknown
  createdAt: string
  updatedAt: string
  executedAt?: string
}

export function isOpenAction(action: Pick<OpsAction, 'status'>) {
  return (
    action.status === 'queued' ||
    action.status === 'pending_confirmation' ||
    action.status === 'executing'
  )
}

export type RawAction = {
  action?: unknown
  target?: unknown
  risk?: unknown
  requires_confirm?: unknown
  requiresConfirm?: unknown
  reason?: unknown
  payload?: unknown
  params?: unknown
  channel?: unknown
  channel_id?: unknown
  channelId?: unknown
  channel_name?: unknown
  channelName?: unknown
  changes?: unknown
  model?: unknown
}

const AUDIT_PATH = process.env.AI_OPS_ACTION_AUDIT_PATH?.trim() || 'data/action-audit.jsonl'
const CHANNEL_STATUS_ENABLED = 1
const CHANNEL_STATUS_AUTO_DISABLED = 2
const REDACTED_VALUE = '[REDACTED]'
const CREATE_CHANNEL_FIELDS = new Set([
  'name',
  'type',
  'key',
  'base_url',
  'models',
  'group',
  'groups',
  'tag',
  'weight',
  'priority',
  'auto_ban',
  'model_mapping',
  'openai_organization',
  'test_model',
  'remark',
])
const CREATE_CHANNEL_MODES = new Set(['single', 'batch', 'multi_to_single'])
const KNOWN_ACTIONS = new Set([
  'test_channel',
  'notify_low_balance',
  'create_channel',
  'update_channel',
  'disable_channel',
  'delete_channel',
])

function now() {
  return new Date().toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeRisk(value: unknown): OpsAction['risk'] {
  return value === 'medium' || value === 'high' || value === 'low'
    ? value
    : 'low'
}

function redactSensitiveText(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED_VALUE}`)
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9._-]{12,}\b/g, REDACTED_VALUE)
    .replace(
      /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      REDACTED_VALUE
    )
}

function isSensitiveField(key: string) {
  const normalized = key.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return [
    'key',
    'api_key',
    'apikey',
    'authorization',
    'cookie',
    'password',
    'secret',
    'token',
    'access_token',
    'refresh_token',
  ].includes(normalized)
}

function redactSensitiveValue(value: unknown, fieldName?: string): unknown {
  if (fieldName && isSensitiveField(fieldName)) {
    return REDACTED_VALUE
  }

  if (typeof value === 'string') {
    return redactSensitiveText(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item))
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactSensitiveValue(item, key),
      ])
    )
  }

  return value
}

function normalizeActionName(value: unknown) {
  const action = String(value || '').trim().toLowerCase()
  const normalized = action.replace(/[\s-]+/g, '_')

  if (
    [
      'inspect_channel_errors',
      'test_channel',
      'test_channel_model',
      'check_channel',
      'channel_test',
      'test_channel_connectivity',
    ].includes(normalized)
  ) {
    return 'test_channel'
  }

  if (['notify_low_balance', 'low_balance_notify'].includes(normalized)) {
    return 'notify_low_balance'
  }

  if (['create_channel', 'add_channel'].includes(normalized)) {
    return 'create_channel'
  }

  if (
    [
      'update_channel',
      'modify_channel',
      'adjust_channel_weight',
      'adjust_channel_priority',
      'update_channel_group',
      'update_channel_models',
      'update_channel_note',
      'update_note',
      'remark_channel',
    ].includes(normalized)
  ) {
    return 'update_channel'
  }

  if (['disable_channel', 'auto_disable_channel'].includes(normalized)) {
    return 'disable_channel'
  }

  if (['delete_channel', 'remove_channel'].includes(normalized)) {
    return 'delete_channel'
  }

  return normalized || 'unknown'
}

function parseChannelId(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  const text = String(value || '')
  const match = text.match(/(?:channel:|#)?(\d+)/i)
  return match ? Number(match[1]) : undefined
}

function rawPayload(raw: RawAction) {
  if (isRecord(raw.payload)) return raw.payload
  if (isRecord(raw.params)) return raw.params
  if (isRecord(raw.changes)) return raw.changes
  if (isRecord(raw.channel)) return { channel: raw.channel }
  if (typeof raw.model === 'string') return { model: raw.model }
  return undefined
}

function readChannelNameFromRaw(raw: RawAction) {
  const direct = raw.channel_name ?? raw.channelName
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const payload = rawPayload(raw)
  const payloadChannel = isRecord(payload?.channel) ? payload.channel : payload
  if (isRecord(payloadChannel) && typeof payloadChannel.name === 'string') {
    const name = payloadChannel.name.trim()
    if (name) return name
  }

  const target =
    raw.target === undefined || raw.target === null ? '' : String(raw.target).trim()
  return target && !parseChannelId(target) ? target : undefined
}

function extractJsonBlocks(report: string) {
  const blocks: string[] = []
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = fencePattern.exec(report))) {
    blocks.push(match[1].trim())
  }
  return blocks
}

function readRawActions(value: unknown): RawAction[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  if (isRecord(value) && Array.isArray(value.proposed_actions)) {
    return value.proposed_actions.filter(isRecord)
  }
  return []
}

export function createOpsAction(
  raw: RawAction,
  index = 0,
  source: OpsAction['source'] = 'report',
  meta: Pick<OpsAction, 'reportName'> = {}
): OpsAction {
  const action = normalizeActionName(raw.action)
  const channelName = readChannelNameFromRaw(raw)
  const target =
    raw.target === undefined
      ? channelName
      : String(raw.target)
  const channelId =
    action === 'create_channel'
      ? undefined
      : parseChannelId(raw.channel_id) ??
        parseChannelId(raw.channelId) ??
        parseChannelId(target)
  const createdAt = now()

  return {
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    action,
    rawAction: String(raw.action || ''),
    source,
    reportName: meta.reportName,
    target,
    channelId,
    channelName,
    risk: normalizeRisk(raw.risk),
    requiresConfirm:
      raw.requires_confirm === true || raw.requiresConfirm === true,
    reason: String(raw.reason || 'AI proposed action'),
    payload: rawPayload(raw),
    status: 'queued',
    createdAt,
    updatedAt: createdAt,
  }
}

export function parseReportActions(
  report: string,
  meta: Pick<OpsAction, 'reportName'> = {}
): OpsAction[] {
  const candidates = extractJsonBlocks(report)
  if (!candidates.length) return []

  const parsed: RawAction[] = []
  for (const candidate of candidates) {
    try {
      parsed.push(...readRawActions(JSON.parse(candidate)))
    } catch {
      // Ignore non-action JSON blocks.
    }
  }

  return parsed.map((raw, index) => createOpsAction(raw, index, 'report', meta))
}

function permissionKey(action: string): keyof OpsSettings['aiExecution']['permissions'] | undefined {
  if (action === 'test_channel') return 'testChannel'
  if (action === 'create_channel') return 'createChannel'
  if (action === 'update_channel') return 'updateChannel'
  if (action === 'disable_channel') return 'disableChannel'
  if (action === 'delete_channel') return 'deleteChannel'
  return undefined
}

function confirmationKey(action: string): keyof OpsSettings['aiExecution']['confirmation'] | undefined {
  if (action === 'test_channel') return 'testChannel'
  if (action === 'create_channel') return 'createChannel'
  if (action === 'update_channel') return 'updateChannel'
  if (action === 'disable_channel') return 'disableChannel'
  if (action === 'delete_channel') return 'deleteChannel'
  return undefined
}

function actionLabel(action: string) {
  if (action === 'test_channel') return '测试渠道'
  if (action === 'notify_low_balance') return '低余额通知'
  if (action === 'create_channel') return '创建渠道'
  if (action === 'update_channel') return '修改渠道'
  if (action === 'disable_channel') return '禁用渠道'
  if (action === 'delete_channel') return '删除渠道'
  return action
}

function permissionLabel(
  permission: keyof OpsSettings['aiExecution']['permissions']
) {
  if (permission === 'testChannel') return '测试渠道'
  if (permission === 'createChannel') return '创建渠道'
  if (permission === 'updateChannel') return '开启/修改渠道'
  if (permission === 'disableChannel') return '禁用渠道'
  if (permission === 'deleteChannel') return '删除渠道'
  return permission
}

function mutatesChannel(action: string) {
  return Boolean(permissionKey(action))
}

function requiresExistingChannel(action: string) {
  return ['update_channel', 'disable_channel', 'delete_channel'].includes(action)
}

function isStatusOnlyEnableAction(action: OpsAction) {
  if (action.action !== 'update_channel' || !action.payload) return false
  const payload = sanitizeUpdatePayload(action.payload)
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined)
  if (entries.length !== 1) return false
  const [key, value] = entries[0]
  return key === 'status' && Number(value) === CHANNEL_STATUS_ENABLED
}

function isAutomaticMaintenanceAction(action: OpsAction) {
  return action.action === 'disable_channel' || isStatusOnlyEnableAction(action)
}

function manualConfirmationReason(action: OpsAction) {
  if (action.action === 'create_channel') return '创建渠道只允许生成草案，需人工确认'
  if (action.action === 'delete_channel') return '删除渠道只允许生成草案，需人工确认'
  if (action.action === 'update_channel' && !isAutomaticMaintenanceAction(action)) {
    return '非开启渠道的修改需人工确认'
  }
  return undefined
}

function normalizeText(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function protectedByText(
  value: unknown,
  rules: string[],
  mode: 'equals' | 'includes'
) {
  const text = normalizeText(value)
  if (!text) return false
  return rules.some((rule) => {
    const next = normalizeText(rule)
    return next && (mode === 'equals' ? text === next : text.includes(next))
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

async function readChannel(
  client: NewApiClient,
  channelId: number | undefined
) {
  if (!channelId) return undefined
  try {
    return (await client.getChannel(channelId)) as Channel
  } catch {
    return undefined
  }
}

function isProtectedChannel(
  action: OpsAction,
  settings: OpsSettings,
  channel?: Channel
) {
  const rules = settings.aiExecution.protectedChannels
  if (action.channelId !== undefined && rules.ids.includes(action.channelId)) {
    return '渠道已被 AI 保护'
  }
  if (!channel) return undefined
  if (rules.types.includes(channel.type)) return '渠道类型已被 AI 保护'
  if (protectedByDelimitedText(channel.group, rules.groups)) {
    return '渠道分组已被 AI 保护'
  }
  if (protectedByDelimitedText(channel.tag, rules.tags)) {
    return '渠道标签已被 AI 保护'
  }
  if (protectedByText(channel.name, rules.nameIncludes, 'includes')) {
    return '渠道名称命中 AI 保护规则'
  }
  if (protectedByText(channel.models, rules.modelIncludes, 'includes')) {
    return '渠道模型命中 AI 保护规则'
  }
  return undefined
}

function createPayloadProtectionReason(
  action: OpsAction,
  settings: OpsSettings
) {
  if (action.action !== 'create_channel' || !action.payload) return undefined
  const payload = normalizeCreatePayload(action.payload)
  const channel = isRecord(payload.channel) ? payload.channel : undefined
  if (!channel) return undefined

  return isProtectedChannel(action, settings, {
    id: 0,
    type: Number(channel.type || 0),
    status: 1,
    name: String(channel.name || ''),
    group: String(channel.group || ''),
    tag: channel.tag === undefined ? null : String(channel.tag),
    models: String(channel.models || ''),
  } as Channel)
}

function payloadRequirementReason(action: OpsAction) {
  if (action.action === 'create_channel') {
    if (!action.payload) return '创建渠道需要 payload'

    const payload = normalizeCreatePayload(action.payload)
    const channel = isRecord(payload.channel) ? payload.channel : {}
    if (!Object.keys(channel).length) return '创建渠道 payload 为空'
    if (!normalizeText(channel.key)) return '创建渠道需要渠道密钥'
  }

  if (action.action === 'update_channel') {
    if (!action.payload) return '修改渠道需要 payload'
    if (!Object.keys(sanitizeUpdatePayload(action.payload)).length) {
      return '修改渠道 payload 没有可更新字段'
    }
  }

  return undefined
}

async function appendAudit(action: OpsAction) {
  await mkdir(dirname(AUDIT_PATH), { recursive: true })
  await appendFile(AUDIT_PATH, `${JSON.stringify(sanitizeActionForClient(action))}\n`)

  try {
    const settings = await loadOpsSettings()
    await pruneActionAudit(settings.storage.maxActionAuditEntries)
  } catch (error) {
    logger.warn('failed to prune action audit log', error)
  }
}

export async function pruneActionAudit(maxEntries: number) {
  const limit = Math.max(1, Math.floor(maxEntries))

  try {
    const raw = await readFile(AUDIT_PATH, 'utf8')
    const lines = raw.trim().split('\n').filter(Boolean)
    if (lines.length <= limit) return

    await mkdir(dirname(AUDIT_PATH), { recursive: true })
    await writeFile(AUDIT_PATH, `${lines.slice(-limit).join('\n')}\n`)
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error
  }
}

function parseAuditLine(line: string) {
  try {
    const parsed = JSON.parse(line) as unknown
    if (!isRecord(parsed)) return undefined
    if (typeof parsed.id !== 'string') return undefined
    if (typeof parsed.action !== 'string') return undefined
    if (typeof parsed.status !== 'string') return undefined
    return parsed as OpsAction
  } catch {
    return undefined
  }
}

function actionAuditTime(action: OpsAction) {
  const candidates = [action.executedAt, action.updatedAt, action.createdAt]
  for (const value of candidates) {
    const timestamp = Date.parse(String(value || ''))
    if (Number.isFinite(timestamp)) return timestamp
  }
  return 0
}

export async function listActionAudit(options: { limit?: number } = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 100), 1), 1000)
  try {
    const raw = await readFile(AUDIT_PATH, 'utf8')
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
      .map(parseAuditLine)
      .filter((item): item is OpsAction => Boolean(item))
      .sort((a, b) => actionAuditTime(b) - actionAuditTime(a))
      .map(sanitizeActionForClient)
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return []
    throw error
  }
}

async function coolingDown(action: OpsAction, settings: OpsSettings) {
  if (!action.channelId || settings.aiExecution.safety.channelCooldownMinutes <= 0) {
    return false
  }

  try {
    const raw = await readFile(AUDIT_PATH, 'utf8')
    const cutoff =
      Date.now() - settings.aiExecution.safety.channelCooldownMinutes * 60_000
    return raw
      .trim()
      .split('\n')
      .slice(-500)
      .some((line) => {
        try {
          const item = JSON.parse(line) as OpsAction
          return (
            item.channelId === action.channelId &&
            item.action === action.action &&
            item.status === 'executed' &&
            item.executedAt !== undefined &&
            new Date(item.executedAt).getTime() >= cutoff
          )
        } catch {
          return false
        }
      })
  } catch {
    return false
  }
}

function updateAction(
  action: OpsAction,
  patch: Partial<OpsAction>
): OpsAction {
  return {
    ...action,
    ...patch,
    updatedAt: now(),
  }
}

function withChannelIdentity(action: OpsAction, channel?: Channel) {
  if (!channel?.name) return action
  return updateAction(action, {
    channelName: channel.name,
    target: channel.name,
  })
}

export function sanitizeActionForClient(action: OpsAction): OpsAction {
  return redactSensitiveValue(action) as OpsAction
}

async function evaluateAction(
  action: OpsAction,
  settings: OpsSettings,
  snapshot: HealthSnapshot,
  client: NewApiClient
) {
  if (!settings.aiExecution.enabled) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: 'AI 执行总开关已关闭',
    })
  }

  if (!KNOWN_ACTIONS.has(action.action)) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `不支持的动作：${action.rawAction || action.action}`,
    })
  }

  const permission = permissionKey(action.action)
  if (permission && !settings.aiExecution.permissions[permission]) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `${permissionLabel(permission)}权限已关闭`,
    })
  }

  const confirmation = confirmationKey(action.action)
  const strategy = confirmation
    ? settings.aiExecution.confirmation[confirmation]
    : 'auto'

  if (strategy === 'never') {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `${actionLabel(action.action)}被设置为永不允许`,
    })
  }

  if (
    ['test_channel', 'update_channel', 'disable_channel', 'delete_channel'].includes(action.action) &&
    !action.channelId
  ) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `${actionLabel(action.action)}需要渠道 ID`,
    })
  }

  const payloadReason = payloadRequirementReason(action)
  if (payloadReason) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: payloadReason,
    })
  }

  const createProtectedReason = createPayloadProtectionReason(action, settings)
  if (createProtectedReason) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: createProtectedReason,
    })
  }

  const channel = await readChannel(client, action.channelId)
  const actionWithChannel = withChannelIdentity(action, channel)
  if (requiresExistingChannel(actionWithChannel.action) && !channel) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: '无法验证渠道是否存在',
    })
  }

  const protectedReason =
    actionWithChannel.action === 'test_channel'
      ? undefined
      : isProtectedChannel(actionWithChannel, settings, channel)
  if (protectedReason) {
    return updateAction(actionWithChannel, {
      status: 'blocked',
      statusReason: protectedReason,
    })
  }

  if (await coolingDown(actionWithChannel, settings)) {
    return updateAction(actionWithChannel, {
      status: 'blocked',
      statusReason: '渠道动作仍在冷却时间内',
    })
  }

  if (mutatesChannel(actionWithChannel.action) && snapshot.logs.total < settings.aiExecution.safety.minRequestsForActions) {
    return updateAction(actionWithChannel, {
      status: 'pending_confirmation',
      requiresConfirm: true,
      statusReason: '样本数量低于安全阈值，需人工确认',
    })
  }

  const manualReason = manualConfirmationReason(actionWithChannel)
  if (manualReason) {
    return updateAction(actionWithChannel, {
      status: 'pending_confirmation',
      requiresConfirm: true,
      statusReason: manualReason,
    })
  }

  const autoMaintenance = isAutomaticMaintenanceAction(actionWithChannel)
  if (
    strategy === 'confirm' ||
    (!autoMaintenance && (actionWithChannel.requiresConfirm || actionWithChannel.risk !== 'low'))
  ) {
    return updateAction(actionWithChannel, {
      status: 'pending_confirmation',
      requiresConfirm: true,
      statusReason: '等待人工确认',
    })
  }

  return updateAction(actionWithChannel, {
    status: 'queued',
    statusReason: '已准备执行',
  })
}

async function executeWithClient(
  action: OpsAction,
  client: NewApiClient
) {
  if (action.action === 'notify_low_balance') {
    return { message: 'notification action recorded' }
  }

  if (action.action === 'test_channel') {
    if (!action.channelId) throw new Error('测试渠道需要渠道 ID')
    const model =
      typeof action.payload?.model === 'string'
        ? action.payload.model
        : undefined
    return client.testChannel(action.channelId, model)
  }

  if (action.action === 'create_channel') {
    if (!action.payload) {
      throw new Error('创建渠道需要 payload')
    }
    return client.createChannel(normalizeCreatePayload(action.payload))
  }

  if (action.action === 'update_channel') {
    if (!action.channelId) throw new Error('修改渠道需要渠道 ID')
    if (!action.payload) throw new Error('修改渠道需要 payload')
    const payload = sanitizeUpdatePayload(action.payload)
    const result = await client.updateChannel(action.channelId, payload)
    if (Object.prototype.hasOwnProperty.call(payload, 'remark')) {
      try {
        await saveChannelMemory(action.channelId, {
          manualNote: payload.remark,
        })
      } catch (error) {
        logger.warn('failed to sync executed channel remark to memory', {
          channelId: action.channelId,
          error,
        })
      }
    }
    return result
  }

  if (action.action === 'disable_channel') {
    if (!action.channelId) throw new Error('禁用渠道需要渠道 ID')
    return client.updateChannel(action.channelId, {
      status: CHANNEL_STATUS_AUTO_DISABLED,
    })
  }

  if (action.action === 'delete_channel') {
    if (!action.channelId) throw new Error('删除渠道需要渠道 ID')
    return client.deleteChannel(action.channelId)
  }

  throw new Error(`不支持的动作：${action.action}`)
}

function normalizeCreatePayload(payload: Record<string, unknown>) {
  const source = isRecord(payload.channel) ? payload : { channel: payload }
  const mode =
    typeof source.mode === 'string' && CREATE_CHANNEL_MODES.has(source.mode)
      ? source.mode
      : 'single'
  const result: Record<string, unknown> = {
    mode,
    channel: sanitizeCreateChannelPayload(
      isRecord(source.channel) ? source.channel : {}
    ),
  }

  if (mode === 'multi_to_single' && typeof source.multi_key_mode === 'string') {
    result.multi_key_mode = source.multi_key_mode
  }

  return {
    ...result,
  }
}

function sanitizeCreateChannelPayload(payload: Record<string, unknown>) {
  return normalizeChannelPayload(
    Object.fromEntries(
      Object.entries(payload).filter(([key]) => CREATE_CHANNEL_FIELDS.has(key))
    )
  )
}

function sanitizeUpdatePayload(payload: Record<string, unknown>) {
  const allowed = new Set([
    'status',
    'weight',
    'priority',
    'group',
    'tag',
    'models',
    'model_mapping',
    'auto_ban',
    'remark',
  ])
  return normalizeChannelPayload(
    Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.has(key)))
  )
}

function normalizeChannelPayload(payload: Record<string, unknown>) {
  const next = { ...payload }

  if (Array.isArray(next.models)) {
    next.models = stringifyList(next.models)
  }
  if (Array.isArray(next.group)) {
    next.group = stringifyList(next.group)
  }
  if (Array.isArray(next.groups) && !next.group) {
    next.group = stringifyList(next.groups)
  }
  if (isRecord(next.model_mapping) || Array.isArray(next.model_mapping)) {
    next.model_mapping = JSON.stringify(next.model_mapping)
  }
  if (typeof next.auto_ban === 'boolean') {
    next.auto_ban = next.auto_ban ? 1 : 0
  }

  for (const key of ['status', 'type', 'weight', 'priority', 'auto_ban']) {
    if (next[key] !== undefined && next[key] !== null && next[key] !== '') {
      const value = Number(next[key])
      if (Number.isFinite(value)) next[key] = value
    }
  }

  delete next.groups
  return Object.fromEntries(
    Object.entries(next).filter(([, value]) => value !== undefined)
  )
}

function stringifyList(items: unknown[]) {
  return items
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(',')
}

export async function buildActionQueue(
  config: AppConfig,
  snapshot: HealthSnapshot,
  report: string,
  meta: Pick<OpsAction, 'reportName'> = {}
) {
  const settings = await loadOpsSettings()
  const client = new NewApiClient(config.newApi)
  const parsed = parseReportActions(report, meta)
  const evaluated: OpsAction[] = []

  for (const action of parsed) {
    evaluated.push(await evaluateAction(action, settings, snapshot, client))
  }

  let executed = 0
  const maxActions = settings.aiExecution.safety.maxActionsPerRun
  const results: OpsAction[] = []

  for (const action of evaluated) {
    if (action.status !== 'queued') {
      if (!isOpenAction(action)) await appendAudit(action)
      results.push(action)
      continue
    }

    if (executed >= maxActions) {
      results.push(updateAction(action, {
        status: 'pending_confirmation',
        requiresConfirm: true,
        statusReason: '已达到单次最大动作数量，需人工确认',
      }))
      continue
    }

    const next = await executeActionNow(config, action)
    if (next.status === 'executed') executed += 1
    results.push(next)
  }

  return results
}

export async function buildAssistantActionDrafts(
  config: AppConfig,
  rawActions: RawAction[]
) {
  const settings = await loadOpsSettings()
  const client = new NewApiClient(config.newApi)
  const drafts: OpsAction[] = []

  for (const [index, raw] of rawActions.entries()) {
    const action = createOpsAction(raw, index, 'assistant')
    const checked = await evaluateManualAction(action, settings, client)

    if (checked.status === 'blocked') {
      await appendAudit(checked)
      drafts.push(checked)
      continue
    }

    drafts.push(updateAction(checked, {
      status: 'pending_confirmation',
      requiresConfirm: true,
      statusReason: '等待人工确认',
    }))
  }

  return drafts
}

export async function buildActiveTestActionDrafts(
  config: AppConfig,
  memories: ChannelMemory[],
  failureThreshold: number,
  recoveryThreshold: number
) {
  const rawActions: RawAction[] = []

  for (const memory of memories) {
    if (
      memory.channelStatus === CHANNEL_STATUS_ENABLED &&
      memory.testSummary.lastStatus === 'failed' &&
      memory.testSummary.consecutiveFailures >= failureThreshold
    ) {
      rawActions.push({
        action: 'disable_channel',
        target: memory.channelName || '未命名渠道',
        channel_id: memory.channelId,
        channel_name: memory.channelName,
        risk: 'medium',
        requires_confirm: true,
        reason: `主动测试观察到连续 ${memory.testSummary.consecutiveFailures} 次失败${memory.testSummary.lastError ? `：${memory.testSummary.lastError}` : ''}`,
      })
      continue
    }

    if (
      memory.channelStatus !== undefined &&
      memory.channelStatus !== CHANNEL_STATUS_ENABLED &&
      memory.testSummary.lastStatus === 'success' &&
      (memory.testSummary.consecutiveSuccesses || 0) >= recoveryThreshold
    ) {
      rawActions.push({
        action: 'update_channel',
        target: memory.channelName || '未命名渠道',
        channel_id: memory.channelId,
        channel_name: memory.channelName,
        risk: 'medium',
        requires_confirm: true,
        reason: `主动测试观察到连续 ${memory.testSummary.consecutiveSuccesses || 0} 次成功，当前渠道状态为 ${memory.channelStatus}`,
        payload: { status: CHANNEL_STATUS_ENABLED },
      })
    }
  }

  const settings = await loadOpsSettings()
  const client = new NewApiClient(config.newApi)
  const drafts: OpsAction[] = []
  const maxActions = settings.aiExecution.safety.maxActionsPerRun
  let executed = 0

  for (const [index, raw] of rawActions.entries()) {
    const action = createOpsAction(raw, index, 'active_test')
    const checked = await evaluateManualAction(action, settings, client)

    if (checked.status === 'blocked') {
      await appendAudit(checked)
      drafts.push(checked)
      continue
    }

    const confirmation = confirmationKey(checked.action)
    const strategy = confirmation
      ? settings.aiExecution.confirmation[confirmation]
      : 'confirm'
    if (strategy === 'auto' && isAutomaticMaintenanceAction(checked)) {
      if (executed >= maxActions) {
        drafts.push(updateAction(checked, {
          status: 'pending_confirmation',
          requiresConfirm: true,
          statusReason: '已达到单次最大动作数量，需人工确认',
        }))
        continue
      }

      const result = await executeActionNow(config, updateAction(checked, {
        status: 'queued',
        requiresConfirm: false,
        statusReason: '主动测试达到启停阈值，自动执行',
      }))
      if (result.status === 'executed') executed += 1
      drafts.push(result)
      continue
    }

    drafts.push(updateAction(checked, {
      status: 'pending_confirmation',
      requiresConfirm: true,
      statusReason:
        checked.action === 'update_channel'
          ? '主动测试观察到非启用渠道已恢复'
          : '主动测试达到连续失败阈值',
    }))
  }

  return drafts
}

export async function executeActionNow(config: AppConfig, action: OpsAction) {
  const executing = updateAction(action, { status: 'executing' })
  try {
    const result = await executeWithClient(
      executing,
      new NewApiClient(config.newApi)
    )
    const executed = updateAction(executing, {
      status: 'executed',
      result,
      executedAt: now(),
    })
    await appendAudit(executed)
    return executed
  } catch (error) {
    const failed = updateAction(executing, {
      status: 'failed',
      statusReason: error instanceof Error ? error.message : String(error),
    })
    await appendAudit(failed)
    return failed
  }
}

export async function confirmAndExecuteAction(
  config: AppConfig,
  action: OpsAction
) {
  if (action.status !== 'pending_confirmation' && action.status !== 'queued') {
    return updateAction(action, {
      statusReason: `当前状态为 ${action.status}，不能执行`,
    })
  }
  const checked = await evaluateManualAction(
    action,
    await loadOpsSettings(),
    new NewApiClient(config.newApi)
  )
  if (checked.status === 'blocked') {
    await appendAudit(checked)
    return checked
  }
  return executeActionNow(config, action)
}

async function evaluateManualAction(
  action: OpsAction,
  settings: OpsSettings,
  client: NewApiClient
) {
  if (!settings.aiExecution.enabled) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: 'AI 执行总开关已关闭',
    })
  }

  if (!KNOWN_ACTIONS.has(action.action)) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `不支持的动作：${action.rawAction || action.action}`,
    })
  }

  const permission = permissionKey(action.action)
  if (permission && !settings.aiExecution.permissions[permission]) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `${permissionLabel(permission)}权限已关闭`,
    })
  }

  const confirmation = confirmationKey(action.action)
  if (confirmation && settings.aiExecution.confirmation[confirmation] === 'never') {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `${actionLabel(action.action)}被设置为永不允许`,
    })
  }

  if (
    ['test_channel', 'update_channel', 'disable_channel', 'delete_channel'].includes(action.action) &&
    !action.channelId
  ) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `${actionLabel(action.action)}需要渠道 ID`,
    })
  }

  const payloadReason = payloadRequirementReason(action)
  if (payloadReason) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: payloadReason,
    })
  }

  const channel = await readChannel(client, action.channelId)
  const actionWithChannel = withChannelIdentity(action, channel)
  if (requiresExistingChannel(actionWithChannel.action) && !channel) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: '无法验证渠道是否存在',
    })
  }

  const createProtectedReason = createPayloadProtectionReason(action, settings)
  if (createProtectedReason) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: createProtectedReason,
    })
  }

  const protectedReason =
    actionWithChannel.action === 'test_channel'
      ? undefined
      : isProtectedChannel(actionWithChannel, settings, channel)
  if (protectedReason) {
    return updateAction(actionWithChannel, {
      status: 'blocked',
      statusReason: protectedReason,
    })
  }

  if (await coolingDown(actionWithChannel, settings)) {
    return updateAction(actionWithChannel, {
      status: 'blocked',
      statusReason: '渠道动作仍在冷却时间内',
    })
  }

  return actionWithChannel
}

export async function rejectAction(action: OpsAction) {
  const rejected = updateAction(action, {
    status: 'rejected',
    statusReason: '已由操作员拒绝',
  })
  await appendAudit(rejected)
  return rejected
}
