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
    customInstructions: string
    assistantInstructions: string
  }
  report: {
    intervalMinutes: number
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

const SETTINGS_PATH = process.env.AI_OPS_SETTINGS_PATH?.trim() || 'data/settings.json'

const DEFAULT_SETTINGS: OpsSettings = {
  version: 1,
  llm: {
    baseUrl: '',
    model: '',
    temperature: 0.2,
  },
  context: {
    enabled: true,
    includeChannelSummary: true,
    includeChannelDetails: true,
    includeRecentLogs: true,
    includeLogStats: true,
    includeModels: true,
    includeLatency: true,
    includeBalance: false,
    includeChannelMemory: true,
    maxChannels: 80,
    maxLogs: 50,
  },
  prompt: {
    customInstructions: '',
    assistantInstructions: [
      '创建渠道动作格式: {"action":"create_channel","target":"渠道名称","risk":"medium","requires_confirm":true,"reason":"原因","payload":{"mode":"single","channel":{"name":"名称","type":1,"key":"[API_KEY_1]","base_url":"https://...","models":"model-a,model-b","group":"default","priority":0,"weight":0,"remark":"可选备注"}}}',
      '测试渠道动作格式: {"action":"test_channel","target":"渠道名称","channel_id":12,"channel_name":"渠道名称","risk":"low","requires_confirm":true,"reason":"原因","payload":{"model":"可选模型"}}。',
      '更新备注动作格式: {"action":"update_channel","target":"渠道名称","channel_id":12,"channel_name":"渠道名称","risk":"medium","requires_confirm":true,"reason":"原因","payload":{"remark":"备注内容"}}。',
      '创建渠道必须有 base_url、key、models；如果缺字段，只追问，不要编造，也不要生成 create_channel。',
      '模型名没有固定前缀，mimo-v2.5-pro、mimo-v2.5、provider/model、custom-001 都可能是合法模型。用户在“模型/支持模型/models”附近给出的逗号、顿号、空格分隔值都应视作模型列表。',
      '输入里的密钥、Authorization、Cookie 会以 [API_KEY_1] 这类占位符出现；create_channel 的 payload.channel.key 必须使用密钥占位符，例如 [API_KEY_1]。',
      '如果用户分多轮补充信息，你可以结合最近对话上下文生成完整动作；例如上一轮已有 [API_KEY_1] 和 base_url，本轮只补模型时，可以使用 [API_KEY_1]。',
      '回复中要提醒用户到动作队列查看后端策略给出的最终状态。',
    ].join('\n'),
  },
  report: {
    intervalMinutes: 15,
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
  activeTesting: {
    enabled: false,
    intervalMinutes: 30,
    concurrency: 2,
    failureThreshold: 3,
    recoveryThreshold: 1,
    historyLimit: 3,
  },
  storage: {
    maxReports: 500,
    maxActionAuditEntries: 5000,
    maxAppLogEntries: 5000,
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
      customInstructions: readText(
        prompt,
        'customInstructions',
        defaults.prompt.customInstructions,
        5000
      ),
      assistantInstructions: readText(
        prompt,
        'assistantInstructions',
        defaults.prompt.assistantInstructions,
        12_000
      ),
    },
    report: {
      intervalMinutes: readNumber(
        report,
        'intervalMinutes',
        defaults.report.intervalMinutes,
        1,
        10_080
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
