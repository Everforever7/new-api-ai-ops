import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AppConfig } from './config'
import type { Channel, HealthSnapshot } from './types/domain'
import { NewApiClient } from './newapi/client'
import { loadOpsSettings, type OpsSettings } from './settings'

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
  target?: string
  channelId?: number
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

type RawAction = {
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
  changes?: unknown
  model?: unknown
}

const AUDIT_PATH = process.env.AI_OPS_ACTION_AUDIT_PATH?.trim() || 'data/action-audit.jsonl'
const CHANNEL_STATUS_AUTO_DISABLED = 2
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

function normalizeActionName(value: unknown) {
  const action = String(value || '').trim().toLowerCase()
  const normalized = action.replace(/[\s-]+/g, '_')

  if (
    [
      'inspect_channel_errors',
      'test_channel',
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

export function parseReportActions(report: string): OpsAction[] {
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

  return parsed.map((raw, index) => {
    const action = normalizeActionName(raw.action)
    const target = raw.target === undefined ? undefined : String(raw.target)
    const channelId =
      parseChannelId(raw.channel_id) ??
      parseChannelId(raw.channelId) ??
      parseChannelId(target)
    const createdAt = now()

    return {
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
      action,
      rawAction: String(raw.action || ''),
      target,
      channelId,
      risk: normalizeRisk(raw.risk),
      requiresConfirm:
        raw.requires_confirm === true || raw.requiresConfirm === true,
      reason: String(raw.reason || 'AI proposed action'),
      payload: rawPayload(raw),
      status: 'queued',
      createdAt,
      updatedAt: createdAt,
    }
  })
}

function permissionKey(action: string): keyof OpsSettings['aiExecution']['permissions'] | undefined {
  if (action === 'create_channel') return 'createChannel'
  if (action === 'update_channel') return 'updateChannel'
  if (action === 'disable_channel') return 'disableChannel'
  if (action === 'delete_channel') return 'deleteChannel'
  return undefined
}

function confirmationKey(action: string): keyof OpsSettings['aiExecution']['confirmation'] | undefined {
  if (action === 'create_channel') return 'createChannel'
  if (action === 'update_channel') return 'updateChannel'
  if (action === 'disable_channel') return 'disableChannel'
  if (action === 'delete_channel') return 'deleteChannel'
  return undefined
}

function mutatesChannel(action: string) {
  return Boolean(permissionKey(action))
}

function requiresExistingChannel(action: string) {
  return ['update_channel', 'disable_channel', 'delete_channel'].includes(action)
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
    return 'channel id is protected'
  }
  if (!channel) return undefined
  if (rules.types.includes(channel.type)) return 'channel type is protected'
  if (protectedByDelimitedText(channel.group, rules.groups)) {
    return 'channel group is protected'
  }
  if (protectedByDelimitedText(channel.tag, rules.tags)) {
    return 'channel tag is protected'
  }
  if (protectedByText(channel.name, rules.nameIncludes, 'includes')) {
    return 'channel name is protected'
  }
  if (protectedByText(channel.models, rules.modelIncludes, 'includes')) {
    return 'channel models are protected'
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
    if (!action.payload) return 'create_channel requires payload'

    const payload = normalizeCreatePayload(action.payload)
    const channel = isRecord(payload.channel) ? payload.channel : {}
    if (!Object.keys(channel).length) return 'create_channel payload is empty'
    if (!normalizeText(channel.key)) return 'create_channel requires channel key'
  }

  if (action.action === 'update_channel') {
    if (!action.payload) return 'update_channel requires payload'
    if (!Object.keys(sanitizeUpdatePayload(action.payload)).length) {
      return 'update_channel payload has no allowed fields'
    }
  }

  return undefined
}

async function appendAudit(action: OpsAction) {
  await mkdir(dirname(AUDIT_PATH), { recursive: true })
  await appendFile(AUDIT_PATH, `${JSON.stringify(action)}\n`)
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

async function evaluateAction(
  action: OpsAction,
  settings: OpsSettings,
  snapshot: HealthSnapshot,
  client: NewApiClient
) {
  if (!settings.aiExecution.enabled) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: 'AI execution is disabled',
    })
  }

  const knownActions = new Set([
    'test_channel',
    'notify_low_balance',
    'create_channel',
    'update_channel',
    'disable_channel',
    'delete_channel',
  ])
  if (!knownActions.has(action.action)) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `unsupported action: ${action.rawAction || action.action}`,
    })
  }

  const permission = permissionKey(action.action)
  if (permission && !settings.aiExecution.permissions[permission]) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `${permission} permission is disabled`,
    })
  }

  const confirmation = confirmationKey(action.action)
  const strategy = confirmation
    ? settings.aiExecution.confirmation[confirmation]
    : 'auto'

  if (strategy === 'never') {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `${action.action} is never allowed`,
    })
  }

  if (
    ['test_channel', 'update_channel', 'disable_channel', 'delete_channel'].includes(action.action) &&
    !action.channelId
  ) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `${action.action} requires channel id`,
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
  if (requiresExistingChannel(action.action) && !channel) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: 'channel could not be verified',
    })
  }

  const protectedReason = isProtectedChannel(action, settings, channel)
  if (protectedReason) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: protectedReason,
    })
  }

  if (await coolingDown(action, settings)) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: 'channel action is cooling down',
    })
  }

  if (mutatesChannel(action.action) && snapshot.logs.total < settings.aiExecution.safety.minRequestsForActions) {
    return updateAction(action, {
      status: 'pending_confirmation',
      requiresConfirm: true,
      statusReason: 'sample size below safety threshold',
    })
  }

  if (strategy === 'confirm' || action.requiresConfirm || action.risk !== 'low') {
    return updateAction(action, {
      status: 'pending_confirmation',
      requiresConfirm: true,
      statusReason: 'waiting for manual confirmation',
    })
  }

  return updateAction(action, {
    status: 'queued',
    statusReason: 'ready to execute',
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
    if (!action.channelId) throw new Error('test_channel requires channel id')
    const model =
      typeof action.payload?.model === 'string'
        ? action.payload.model
        : undefined
    return client.testChannel(action.channelId, model)
  }

  if (action.action === 'create_channel') {
    if (!action.payload) {
      throw new Error('create_channel requires payload')
    }
    return client.createChannel(normalizeCreatePayload(action.payload))
  }

  if (action.action === 'update_channel') {
    if (!action.channelId) throw new Error('update_channel requires channel id')
    if (!action.payload) throw new Error('update_channel requires payload')
    return client.updateChannel(action.channelId, sanitizeUpdatePayload(action.payload))
  }

  if (action.action === 'disable_channel') {
    if (!action.channelId) throw new Error('disable_channel requires channel id')
    return client.updateChannel(action.channelId, {
      status: CHANNEL_STATUS_AUTO_DISABLED,
    })
  }

  if (action.action === 'delete_channel') {
    if (!action.channelId) throw new Error('delete_channel requires channel id')
    return client.deleteChannel(action.channelId)
  }

  throw new Error(`unsupported action: ${action.action}`)
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
  report: string
) {
  const settings = await loadOpsSettings()
  const client = new NewApiClient(config.newApi)
  const parsed = parseReportActions(report)
  const evaluated: OpsAction[] = []

  for (const action of parsed) {
    evaluated.push(await evaluateAction(action, settings, snapshot, client))
  }

  let executed = 0
  const maxActions = settings.aiExecution.safety.maxActionsPerRun
  const results: OpsAction[] = []

  for (const action of evaluated) {
    if (action.status !== 'queued') {
      results.push(action)
      continue
    }

    if (executed >= maxActions) {
      results.push(updateAction(action, {
        status: 'pending_confirmation',
        requiresConfirm: true,
        statusReason: 'max actions per run reached',
      }))
      continue
    }

    const next = await executeActionNow(config, action)
    if (next.status === 'executed') executed += 1
    results.push(next)
  }

  return results
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
      statusReason: `cannot execute action in ${action.status} status`,
    })
  }
  const checked = await evaluateManualAction(
    action,
    await loadOpsSettings(),
    new NewApiClient(config.newApi)
  )
  if (checked.status === 'blocked') return checked
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
      statusReason: 'AI execution is disabled',
    })
  }

  const permission = permissionKey(action.action)
  if (permission && !settings.aiExecution.permissions[permission]) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `${permission} permission is disabled`,
    })
  }

  const confirmation = confirmationKey(action.action)
  if (confirmation && settings.aiExecution.confirmation[confirmation] === 'never') {
    return updateAction(action, {
      status: 'blocked',
      statusReason: `${action.action} is never allowed`,
    })
  }

  const channel = await readChannel(client, action.channelId)
  if (requiresExistingChannel(action.action) && !channel) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: 'channel could not be verified',
    })
  }

  const createProtectedReason = createPayloadProtectionReason(action, settings)
  if (createProtectedReason) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: createProtectedReason,
    })
  }

  const protectedReason = isProtectedChannel(action, settings, channel)
  if (protectedReason) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: protectedReason,
    })
  }

  if (await coolingDown(action, settings)) {
    return updateAction(action, {
      status: 'blocked',
      statusReason: 'channel action is cooling down',
    })
  }

  return action
}

export async function rejectAction(action: OpsAction) {
  const rejected = updateAction(action, {
    status: 'rejected',
    statusReason: 'rejected by operator',
  })
  await appendAudit(rejected)
  return rejected
}
