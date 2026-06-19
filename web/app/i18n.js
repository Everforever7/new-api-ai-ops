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
      settings: '设置',
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
    settings: {
      title: 'AI 执行控制',
      loading: '正在加载设置',
      save: '保存设置',
      saving: '保存中',
      savedAt: '已保存: {value}',
      aiEnabled: 'AI 已允许执行',
      aiDisabled: 'AI 执行关闭',
      globalSwitch: 'AI 执行总开关',
      globalState: '策略生效后仍会先匹配保护规则',
      on: '开启',
      off: '关闭',
      confirmation: {
        auto: '自动执行',
        confirm: '每次确认',
        never: '永不允许',
      },
      permissions: {
        title: '能力权限',
        action: '动作',
        allowed: '允许',
        strategy: '确认策略',
        createChannel: '创建渠道',
        updateChannel: '修改渠道',
        disableChannel: '禁用渠道',
        deleteChannel: '删除渠道',
      },
      safety: {
        title: '执行阈值',
        minRequests: '最低请求数',
        maxActions: '单次最多动作',
        cooldown: '渠道冷却分钟',
      },
      protected: {
        title: '保护渠道规则',
        ids: '渠道 ID',
        groups: '分组',
        tags: '标签',
        names: '名称包含',
        models: '模型包含',
        types: '渠道类型',
      },
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
      settings: 'Settings',
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
    settings: {
      title: 'AI Execution Control',
      loading: 'Loading settings',
      save: 'Save settings',
      saving: 'Saving',
      savedAt: 'Saved: {value}',
      aiEnabled: 'AI execution allowed',
      aiDisabled: 'AI execution disabled',
      globalSwitch: 'AI execution switch',
      globalState: 'Protection rules are still checked first',
      on: 'On',
      off: 'Off',
      confirmation: {
        auto: 'Automatic',
        confirm: 'Confirm each time',
        never: 'Never allow',
      },
      permissions: {
        title: 'Capability permissions',
        action: 'Action',
        allowed: 'Allowed',
        strategy: 'Strategy',
        createChannel: 'Create channel',
        updateChannel: 'Update channel',
        disableChannel: 'Disable channel',
        deleteChannel: 'Delete channel',
      },
      safety: {
        title: 'Execution limits',
        minRequests: 'Minimum requests',
        maxActions: 'Max actions per run',
        cooldown: 'Channel cooldown minutes',
      },
      protected: {
        title: 'Protected channel rules',
        ids: 'Channel IDs',
        groups: 'Groups',
        tags: 'Tags',
        names: 'Name includes',
        models: 'Model includes',
        types: 'Channel types',
      },
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
