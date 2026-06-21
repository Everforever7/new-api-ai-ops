import type { AppConfig } from './config'
import { DEFAULT_OPS_SETTINGS } from './defaults'
import { loadJsonValue, saveJsonValue } from './storage/db'

export type ConfirmationStrategy = 'auto' | 'confirm' | 'never'

export type PromptKeywordSnippet = {
  id: string
  enabled: boolean
  name: string
  keywords: string[]
  content: string
}

export type OpsSettings = {
  version: 1
  llm: {
    baseUrl: string
    model: string
    temperature: number
    apiKey?: string
  }
  context: {
    enabled: boolean
    includeChannelSummary: boolean
    includeChannelDetails: boolean
    includeRecentLogs: boolean
    includeLogStats: boolean
    includeModels: boolean
    includeLatency: boolean
    includeBalance: boolean
    includeChannelMemory: boolean
    maxChannels: number
    maxLogs: number
  }
  prompt: {
    reportInstructions: string
    assistantInstructions: string
    keywordSnippets: PromptKeywordSnippet[]
  }
  report: {
    intervalMinutes: number
    testBeforeRun: boolean
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
  activeTesting: {
    enabled: boolean
    intervalMinutes: number
    concurrency: number
    failureThreshold: number
    recoveryThreshold: number
    historyLimit: number
  }
  storage: {
    maxReports: number
    maxActionAuditEntries: number
    maxAppLogEntries: number
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

const SETTINGS_KEY = 'settings'

function cloneDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_OPS_SETTINGS)) as OpsSettings
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

function readKeywordList(value: unknown) {
  const items =
    typeof value === 'string'
      ? value.split(/[\n,，;；]/g)
      : Array.isArray(value)
        ? value
        : []

  return [...new Set(
    items
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 50)
  )]
}

function readPromptKeywordSnippets(value: unknown): PromptKeywordSnippet[] {
  const items = Array.isArray(value) ? value : []
  return items
    .filter(isRecord)
    .slice(0, 100)
    .map((item, index) => {
      const id = readText(item, 'id', '', 120) || `snippet-${index + 1}`
      const name = readText(item, 'name', '', 120)
      const keywords = readKeywordList(item.keywords)
      const content = readText(item, 'content', '', 5000)
      return {
        id,
        enabled: readBoolean(item, 'enabled', true),
        name,
        keywords,
        content,
      }
    })
    .filter((item) => item.id || item.name || item.keywords.length || item.content)
}

export function normalizeOpsSettings(
  input: unknown,
  previous?: OpsSettings
): OpsSettings {
  const defaults = cloneDefaultSettings()
  const root = isRecord(input) ? input : {}
  const llm = readRecord(root, 'llm')
  const aiExecution = readRecord(root, 'aiExecution')
  const context = readRecord(root, 'context')
  const prompt = readRecord(root, 'prompt')
  const report = readRecord(root, 'report')
  const permissions = readRecord(aiExecution, 'permissions')
  const confirmation = readRecord(aiExecution, 'confirmation')
  const safety = readRecord(aiExecution, 'safety')
  const protectedChannels = readRecord(aiExecution, 'protectedChannels')
  const activeTesting = readRecord(root, 'activeTesting')
  const storage = readRecord(root, 'storage')

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
    context: {
      enabled: readBoolean(
        context,
        'enabled',
        defaults.context.enabled
      ),
      includeChannelSummary: readBoolean(
        context,
        'includeChannelSummary',
        defaults.context.includeChannelSummary
      ),
      includeChannelDetails: readBoolean(
        context,
        'includeChannelDetails',
        defaults.context.includeChannelDetails
      ),
      includeRecentLogs: readBoolean(
        context,
        'includeRecentLogs',
        defaults.context.includeRecentLogs
      ),
      includeLogStats: readBoolean(
        context,
        'includeLogStats',
        defaults.context.includeLogStats
      ),
      includeModels: readBoolean(
        context,
        'includeModels',
        defaults.context.includeModels
      ),
      includeLatency: readBoolean(
        context,
        'includeLatency',
        defaults.context.includeLatency
      ),
      includeBalance: readBoolean(
        context,
        'includeBalance',
        defaults.context.includeBalance
      ),
      includeChannelMemory: readBoolean(
        context,
        'includeChannelMemory',
        defaults.context.includeChannelMemory
      ),
      maxChannels: readNumber(
        context,
        'maxChannels',
        defaults.context.maxChannels,
        1,
        1000
      ),
      maxLogs: readNumber(
        context,
        'maxLogs',
        defaults.context.maxLogs,
        1,
        500
      ),
    },
    prompt: {
      reportInstructions: readText(
        prompt,
        'reportInstructions',
        defaults.prompt.reportInstructions,
        20_000
      ),
      assistantInstructions: readText(
        prompt,
        'assistantInstructions',
        defaults.prompt.assistantInstructions,
        12_000
      ),
      keywordSnippets: readPromptKeywordSnippets(prompt.keywordSnippets),
    },
    report: {
      intervalMinutes: readNumber(
        report,
        'intervalMinutes',
        defaults.report.intervalMinutes,
        1,
        10_080
      ),
      testBeforeRun: readBoolean(
        report,
        'testBeforeRun',
        defaults.report.testBeforeRun
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
    activeTesting: {
      enabled: readBoolean(
        activeTesting,
        'enabled',
        defaults.activeTesting.enabled
      ),
      intervalMinutes: readNumber(
        activeTesting,
        'intervalMinutes',
        defaults.activeTesting.intervalMinutes,
        1,
        10_080
      ),
      concurrency: readNumber(
        activeTesting,
        'concurrency',
        defaults.activeTesting.concurrency,
        1,
        20
      ),
      failureThreshold: readNumber(
        activeTesting,
        'failureThreshold',
        defaults.activeTesting.failureThreshold,
        1,
        100
      ),
      recoveryThreshold: readNumber(
        activeTesting,
        'recoveryThreshold',
        defaults.activeTesting.recoveryThreshold,
        1,
        100
      ),
      historyLimit: readNumber(
        activeTesting,
        'historyLimit',
        defaults.activeTesting.historyLimit,
        1,
        1000
      ),
    },
    storage: {
      maxReports: readNumber(
        storage,
        'maxReports',
        defaults.storage.maxReports,
        1,
        100_000
      ),
      maxActionAuditEntries: readNumber(
        storage,
        'maxActionAuditEntries',
        defaults.storage.maxActionAuditEntries,
        1,
        1_000_000
      ),
      maxAppLogEntries: readNumber(
        storage,
        'maxAppLogEntries',
        defaults.storage.maxAppLogEntries,
        1,
        1_000_000
      ),
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
  return normalizeOpsSettings(loadJsonValue(SETTINGS_KEY) || cloneDefaultSettings())
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
  saveJsonValue(SETTINGS_KEY, settings)
  return settings
}

export async function savePublicOpsSettings(input: unknown, config: AppConfig) {
  return publicOpsSettings(await saveOpsSettings(input), config)
}
