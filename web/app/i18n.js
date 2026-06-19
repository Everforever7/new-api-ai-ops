export const DEFAULT_LOCALE = 'zh-CN'

export const LANGUAGES = [
  { id: 'zh-CN', label: '中文', shortLabel: '中' },
  { id: 'en-US', label: 'English', shortLabel: 'EN' },
]

const dictionaries = {
  'zh-CN': {
    document: {
      title: 'new-api AI 运维助手',
    },
    app: {
      title: 'new-api AI 运维',
    },
    tabs: {
      label: '面板视图',
      dashboard: '仪表盘',
      report: '分析报告',
      channels: '渠道快照',
    },
    status: {
      ready: '系统就绪',
      checking: '正在检查',
      error: '运行异常',
    },
    preferences: {
      language: '语言',
      theme: '主题',
      switchToDark: '切换到黑色样式',
      switchToLight: '切换到白色样式',
    },
    toolbar: {
      statusLabel: '运行状态',
      lastRun: '上次运行: {value}',
      refresh: '刷新数据',
      refreshing: '刷新中',
      runNow: '立即检查',
      checking: '检查中',
    },
    dashboard: {
      channelStatus: '渠道状态',
      channelSummary: '已启用 {enabled} / 自动禁用 {autoDisabled}',
      recentLogs: '近期日志',
      logSummary: '成功 {success} / 错误 {errors}',
      failureRate: '失败率',
      throughput: 'RPM {rpm} / TPM {tpm}',
      lowBalance: '低余额提示',
      slowestChannel: '最慢渠道 #{id} ({time}ms)',
      allFast: '全部极速响应',
    },
    report: {
      title: '最新 AI 分析报告',
      empty: '暂无报告。',
    },
    channels: {
      title: '渠道快照列表',
      id: 'ID',
      name: '名称',
      status: '状态',
      balance: '余额',
      latency: '响应延迟',
      empty: '暂无数据',
    },
    channelStatus: {
      enabled: '启用',
      disabled: '手动禁用',
      autoDisabled: '自动禁用',
      unknown: '未知',
    },
    common: {
      emptyValue: '-',
    },
  },
  'en-US': {
    document: {
      title: 'new-api AI Ops Assistant',
    },
    app: {
      title: 'new-api AI Ops',
    },
    tabs: {
      label: 'Panel views',
      dashboard: 'Dashboard',
      report: 'Report',
      channels: 'Channels',
    },
    status: {
      ready: 'Ready',
      checking: 'Checking',
      error: 'Issue detected',
    },
    preferences: {
      language: 'Language',
      theme: 'Theme',
      switchToDark: 'Switch to dark theme',
      switchToLight: 'Switch to light theme',
    },
    toolbar: {
      statusLabel: 'Run status',
      lastRun: 'Last run: {value}',
      refresh: 'Refresh',
      refreshing: 'Refreshing',
      runNow: 'Run check',
      checking: 'Checking',
    },
    dashboard: {
      channelStatus: 'Channel status',
      channelSummary: 'Enabled {enabled} / auto-disabled {autoDisabled}',
      recentLogs: 'Recent logs',
      logSummary: 'Success {success} / errors {errors}',
      failureRate: 'Failure rate',
      throughput: 'RPM {rpm} / TPM {tpm}',
      lowBalance: 'Low balance',
      slowestChannel: 'Slowest channel #{id} ({time}ms)',
      allFast: 'All channels are responding quickly',
    },
    report: {
      title: 'Latest AI analysis report',
      empty: 'No report yet.',
    },
    channels: {
      title: 'Channel snapshot',
      id: 'ID',
      name: 'Name',
      status: 'Status',
      balance: 'Balance',
      latency: 'Latency',
      empty: 'No data',
    },
    channelStatus: {
      enabled: 'Enabled',
      disabled: 'Disabled',
      autoDisabled: 'Auto disabled',
      unknown: 'Unknown',
    },
    common: {
      emptyValue: '-',
    },
  },
}

export function resolveLocale(locale) {
  return LANGUAGES.some((language) => language.id === locale)
    ? locale
    : DEFAULT_LOCALE
}

export function translate(locale, key, params = {}) {
  const dictionary = dictionaries[resolveLocale(locale)] || dictionaries[DEFAULT_LOCALE]
  const fallback = dictionaries[DEFAULT_LOCALE]
  const value = readPath(dictionary, key) ?? readPath(fallback, key) ?? key

  if (typeof value !== 'string') return key

  return value.replace(/\{(\w+)\}/g, (_, name) => {
    return Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : `{${name}}`
  })
}

function readPath(source, key) {
  return key.split('.').reduce((value, segment) => {
    if (!value || typeof value !== 'object') return undefined
    return value[segment]
  }, source)
}
