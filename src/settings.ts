import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AppConfig } from './config'

export type ConfirmationStrategy = 'auto' | 'confirm' | 'never'

export type OpsSettings = {
  version: 1
  llm: {
    baseUrl: string
    model: string
    temperature: number
    apiKey?: string
  }
  prompt: {
    includeChannelSummary: boolean
    includeErrors: boolean
    includeModels: boolean
    includeLatency: boolean
    includeBalance: boolean
    customInstructions: string
  }
  aiExecution: {
    enabled: boolean
    permissions: {
      testChannel: boolean
      createChannel: boolean
      updateChannel: boolean
      disableChannel: boolean
      deleteChannel: boolean
    }
    confirmation: {
      testChannel: ConfirmationStrategy
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

export type PublicOpsSettings = Omit<OpsSettings, 'llm'> & {
  llm: {
    baseUrl: string
    model: string
    temperature: number
    hasApiKey: boolean
    apiKey: string
    clearApiKey: boolean
  }
}

const SETTINGS_PATH = process.env.AI_OPS_SETTINGS_PATH?.trim() || 'data/settings.json'

const DEFAULT_SETTINGS: OpsSettings = {
  version: 1,
  llm: {
    baseUrl: '',
    model: '',
    temperature: 0.2,
  },
  prompt: {
    includeChannelSummary: true,
    includeErrors: true,
    includeModels: true,
    includeLatency: true,
    includeBalance: false,
    customInstructions: '',
  },
  aiExecution: {
    enabled: true,
    permissions: {
      testChannel: true,
      createChannel: true,
      updateChannel: false,
      disableChannel: false,
      deleteChannel: false,
    },
    confirmation: {
      testChannel: 'confirm',
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
      groups: [],
      tags: [],
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

function readFloat(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number
) {
  const raw = source[key]
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
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

function readText(
  source: Record<string, unknown>,
  key: string,
  fallback: string,
  maxLength: number
) {
  const value = source[key]
  if (typeof value !== 'string') return fallback
  return value.trim().slice(0, maxLength)
}

function cleanUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
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

export function normalizeOpsSettings(
  input: unknown,
  previous?: OpsSettings
): OpsSettings {
  const defaults = cloneDefaultSettings()
  const root = isRecord(input) ? input : {}
  const llm = readRecord(root, 'llm')
  const aiExecution = readRecord(root, 'aiExecution')
  const prompt = readRecord(root, 'prompt')
  const permissions = readRecord(aiExecution, 'permissions')
  const confirmation = readRecord(aiExecution, 'confirmation')
  const safety = readRecord(aiExecution, 'safety')
  const protectedChannels = readRecord(aiExecution, 'protectedChannels')

  const nextApiKey = readText(llm, 'apiKey', '', 20_000)
  const clearApiKey = readBoolean(llm, 'clearApiKey', false)
  const existingApiKey = previous?.llm.apiKey
  const apiKey = clearApiKey
    ? undefined
    : nextApiKey
      ? nextApiKey
      : existingApiKey

  return {
    version: 1,
    llm: {
      baseUrl: cleanUrl(readText(llm, 'baseUrl', defaults.llm.baseUrl, 500)),
      model: readText(llm, 'model', defaults.llm.model, 200),
      temperature: readFloat(
        llm,
        'temperature',
        defaults.llm.temperature,
        0,
        2
      ),
      ...(apiKey ? { apiKey } : {}),
    },
    prompt: {
      includeChannelSummary: readBoolean(
        prompt,
        'includeChannelSummary',
        defaults.prompt.includeChannelSummary
      ),
      includeErrors: readBoolean(
        prompt,
        'includeErrors',
        defaults.prompt.includeErrors
      ),
      includeModels: readBoolean(
        prompt,
        'includeModels',
        defaults.prompt.includeModels
      ),
      includeLatency: readBoolean(
        prompt,
        'includeLatency',
        defaults.prompt.includeLatency
      ),
      includeBalance: readBoolean(
        prompt,
        'includeBalance',
        defaults.prompt.includeBalance
      ),
      customInstructions: readText(
        prompt,
        'customInstructions',
        defaults.prompt.customInstructions,
        5000
      ),
    },
    aiExecution: {
      enabled: readBoolean(
        aiExecution,
        'enabled',
        defaults.aiExecution.enabled
      ),
      permissions: {
        testChannel: readBoolean(
          permissions,
          'testChannel',
          defaults.aiExecution.permissions.testChannel
        ),
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
        testChannel: readStrategy(
          confirmation,
          'testChannel',
          defaults.aiExecution.confirmation.testChannel
        ),
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
        groups: [],
        tags: [],
        nameIncludes: [],
        modelIncludes: [],
        types: [],
      },
    },
  }
}

function effectiveLlmSettings(
  settings: OpsSettings,
  config: AppConfig
): AppConfig['llm'] {
  return {
    baseUrl: settings.llm.baseUrl || config.llm.baseUrl,
    model: settings.llm.model || config.llm.model,
    temperature: settings.llm.temperature,
    apiKey: settings.llm.apiKey || config.llm.apiKey,
  }
}

export function publicOpsSettings(
  settings: OpsSettings,
  config: AppConfig
): PublicOpsSettings {
  const effectiveLlm = effectiveLlmSettings(settings, config)
  return {
    ...settings,
    llm: {
      baseUrl: effectiveLlm.baseUrl,
      model: effectiveLlm.model,
      temperature: effectiveLlm.temperature,
      hasApiKey: Boolean(effectiveLlm.apiKey),
      apiKey: '',
      clearApiKey: false,
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

export async function loadPublicOpsSettings(config: AppConfig) {
  return publicOpsSettings(await loadOpsSettings(), config)
}

export async function loadEffectiveLlmConfig(config: AppConfig) {
  return effectiveLlmSettings(await loadOpsSettings(), config)
}

export async function saveOpsSettings(input: unknown) {
  const previous = await loadOpsSettings()
  const settings = normalizeOpsSettings(input, previous)
  await mkdir(dirname(SETTINGS_PATH), { recursive: true })
  await writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`)
  return settings
}

export async function savePublicOpsSettings(input: unknown, config: AppConfig) {
  return publicOpsSettings(await saveOpsSettings(input), config)
}
