import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type ConfirmationStrategy = 'auto' | 'confirm' | 'never'

export type OpsSettings = {
  version: 1
  aiExecution: {
    enabled: boolean
    permissions: {
      createChannel: boolean
      updateChannel: boolean
      disableChannel: boolean
      deleteChannel: boolean
    }
    confirmation: {
      createChannel: ConfirmationStrategy
      updateChannel: ConfirmationStrategy
      disableChannel: ConfirmationStrategy
      deleteChannel: ConfirmationStrategy
    }
    safety: {
      minRequestsForActions: number
      maxActionsPerRun: number
      channelCooldownMinutes: number
    }
    protectedChannels: {
      ids: number[]
      groups: string[]
      tags: string[]
      nameIncludes: string[]
      modelIncludes: string[]
      types: number[]
    }
  }
}

const SETTINGS_PATH = process.env.AI_OPS_SETTINGS_PATH?.trim() || 'data/settings.json'

const DEFAULT_SETTINGS: OpsSettings = {
  version: 1,
  aiExecution: {
    enabled: true,
    permissions: {
      createChannel: true,
      updateChannel: false,
      disableChannel: false,
      deleteChannel: false,
    },
    confirmation: {
      createChannel: 'confirm',
      updateChannel: 'confirm',
      disableChannel: 'confirm',
      deleteChannel: 'never',
    },
    safety: {
      minRequestsForActions: 20,
      maxActionsPerRun: 3,
      channelCooldownMinutes: 60,
    },
    protectedChannels: {
      ids: [],
      groups: ['vip', 'production-core'],
      tags: ['protected', 'no-ai'],
      nameIncludes: [],
      modelIncludes: [],
      types: [],
    },
  },
}

function cloneDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as OpsSettings
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readRecord(source: Record<string, unknown>, key: string) {
  const value = source[key]
  return isRecord(value) ? value : {}
}

function readBoolean(
  source: Record<string, unknown>,
  key: string,
  fallback: boolean
) {
  const value = source[key]
  return typeof value === 'boolean' ? value : fallback
}

function readNumber(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number
) {
  const raw = source[key]
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function readStrategy(
  source: Record<string, unknown>,
  key: string,
  fallback: ConfirmationStrategy
) {
  const value = source[key]
  return value === 'auto' || value === 'confirm' || value === 'never'
    ? value
    : fallback
}

function readStringArray(
  source: Record<string, unknown>,
  key: string,
  fallback: string[]
) {
  const value = source[key]
  const items =
    typeof value === 'string'
      ? value.split(/[\n,]/g)
      : Array.isArray(value)
        ? value
        : fallback

  return [...new Set(
    items
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 200)
  )]
}

function readNumberArray(
  source: Record<string, unknown>,
  key: string,
  fallback: number[]
) {
  const value = source[key]
  const items =
    typeof value === 'string'
      ? value.split(/[\n,]/g)
      : Array.isArray(value)
        ? value
        : fallback

  return [...new Set(
    items
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0)
      .slice(0, 200)
  )]
}

export function normalizeOpsSettings(input: unknown): OpsSettings {
  const defaults = cloneDefaultSettings()
  const root = isRecord(input) ? input : {}
  const aiExecution = readRecord(root, 'aiExecution')
  const permissions = readRecord(aiExecution, 'permissions')
  const confirmation = readRecord(aiExecution, 'confirmation')
  const safety = readRecord(aiExecution, 'safety')
  const protectedChannels = readRecord(aiExecution, 'protectedChannels')

  return {
    version: 1,
    aiExecution: {
      enabled: readBoolean(
        aiExecution,
        'enabled',
        defaults.aiExecution.enabled
      ),
      permissions: {
        createChannel: readBoolean(
          permissions,
          'createChannel',
          defaults.aiExecution.permissions.createChannel
        ),
        updateChannel: readBoolean(
          permissions,
          'updateChannel',
          defaults.aiExecution.permissions.updateChannel
        ),
        disableChannel: readBoolean(
          permissions,
          'disableChannel',
          defaults.aiExecution.permissions.disableChannel
        ),
        deleteChannel: readBoolean(
          permissions,
          'deleteChannel',
          defaults.aiExecution.permissions.deleteChannel
        ),
      },
      confirmation: {
        createChannel: readStrategy(
          confirmation,
          'createChannel',
          defaults.aiExecution.confirmation.createChannel
        ),
        updateChannel: readStrategy(
          confirmation,
          'updateChannel',
          defaults.aiExecution.confirmation.updateChannel
        ),
        disableChannel: readStrategy(
          confirmation,
          'disableChannel',
          defaults.aiExecution.confirmation.disableChannel
        ),
        deleteChannel: readStrategy(
          confirmation,
          'deleteChannel',
          defaults.aiExecution.confirmation.deleteChannel
        ),
      },
      safety: {
        minRequestsForActions: readNumber(
          safety,
          'minRequestsForActions',
          defaults.aiExecution.safety.minRequestsForActions,
          0,
          1_000_000
        ),
        maxActionsPerRun: readNumber(
          safety,
          'maxActionsPerRun',
          defaults.aiExecution.safety.maxActionsPerRun,
          0,
          1_000
        ),
        channelCooldownMinutes: readNumber(
          safety,
          'channelCooldownMinutes',
          defaults.aiExecution.safety.channelCooldownMinutes,
          0,
          525_600
        ),
      },
      protectedChannels: {
        ids: readNumberArray(
          protectedChannels,
          'ids',
          defaults.aiExecution.protectedChannels.ids
        ),
        groups: readStringArray(
          protectedChannels,
          'groups',
          defaults.aiExecution.protectedChannels.groups
        ),
        tags: readStringArray(
          protectedChannels,
          'tags',
          defaults.aiExecution.protectedChannels.tags
        ),
        nameIncludes: readStringArray(
          protectedChannels,
          'nameIncludes',
          defaults.aiExecution.protectedChannels.nameIncludes
        ),
        modelIncludes: readStringArray(
          protectedChannels,
          'modelIncludes',
          defaults.aiExecution.protectedChannels.modelIncludes
        ),
        types: readNumberArray(
          protectedChannels,
          'types',
          defaults.aiExecution.protectedChannels.types
        ),
      },
    },
  }
}

export async function loadOpsSettings() {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf8')
    return normalizeOpsSettings(JSON.parse(raw))
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return cloneDefaultSettings()
    }
    throw error
  }
}

export async function saveOpsSettings(input: unknown) {
  const settings = normalizeOpsSettings(input)
  await mkdir(dirname(SETTINGS_PATH), { recursive: true })
  await writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`)
  return settings
}
