import type { AppConfig } from './config'
import type { OpsSettings } from './settings'

export const DEFAULT_DB_PATH = 'data/ops.db'

export const DEFAULT_REPORT_INSTRUCTIONS = [
  '请根据下面 JSON 生成 Discord Markdown 巡检报告。',
  '',
  '要求：',
  '1. 标题包含巡检窗口。',
  '2. 先给一句总体判断，明确当前是否需要自动维护动作。',
  '3. 列出异常或风险，最多 20 条；渠道较多时按影响范围、连续失败、错误量、恢复机会排序。不考虑受保护渠道。',
  '4. 给出建议动作，区分“可自动化低风险”和“需要人工确认”。',
  '5. 如果请求量低于 policy.minRequests，要降低结论置信度。',
  '6. 报告末尾保留建议动作区；能自动化的写清楚依据，不能给出明确执行参数的只作为人工处理建议。',
  '7. proposed_actions 可以输出多条候选动作，优先级高的排前面；实际执行数量由后端策略决定。',
].join('\n')

export const DEFAULT_ASSISTANT_INSTRUCTIONS = [
  '如果用户请求创建渠道但缺少 base_url、key、models 等必要信息，只追问缺失字段，不要编造。',
  '模型名没有固定前缀，mimo-v2.5-pro、mimo-v2.5、provider/model、custom-001 都可能是合法模型。用户在“模型/支持模型/models”附近给出的逗号、顿号、空格分隔值都应视作模型列表。',
  '如果用户分多轮补充信息，你可以结合最近对话上下文生成完整动作；例如上一轮已有 [API_KEY_1] 和 base_url，本轮只补模型时，可以使用 [API_KEY_1]。',
  '回复中要提醒用户到动作队列查看后端策略给出的最终状态。',
].join('\n')

export const DEFAULT_APP_CONFIG = {
  newApi: {
    baseUrl: 'http://localhost:3000',
    extraHeaders: {},
    timeoutMs: 20_000,
    channelPageSize: 100,
    logPageSize: 100,
    logHours: 1,
    balanceWarningUsd: 5,
  },
  llm: {
    baseUrl: 'http://localhost:3000/v1',
    model: 'gpt-4.1-mini',
    temperature: 0.2,
  },
  discord: {},
  report: {
    intervalMinutes: 15,
    minRequests: 20,
    failureRateThreshold: 0.3,
    timezone: 'Asia/Hong_Kong',
    saveDir: 'reports',
    includeRawSummary: false,
  },
  panel: {
    enabled: true,
    host: '0.0.0.0',
    port: 8787,
    username: 'admin',
  },
} satisfies AppConfig

export const DEFAULT_OPS_SETTINGS = {
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
    reportInstructions: DEFAULT_REPORT_INSTRUCTIONS,
    assistantInstructions: DEFAULT_ASSISTANT_INSTRUCTIONS,
    keywordSnippets: [],
  },
  report: {
    intervalMinutes: 15,
    testBeforeRun: true,
  },
  aiExecution: {
    enabled: true,
    permissions: {
      testChannel: true,
      createChannel: true,
      updateChannel: true,
      disableChannel: true,
      deleteChannel: true,
    },
    confirmation: {
      testChannel: 'auto',
      createChannel: 'confirm',
      updateChannel: 'auto',
      disableChannel: 'auto',
      deleteChannel: 'confirm',
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
} satisfies OpsSettings
