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
      actions: '动作队列',
      settings: '设置',
    },
    status: {
      ready: '系统就绪',
      checking: '正在检查',
      error: '运行异常',
    },
    errors: {
      dismiss: '关闭错误提示',
      statusLoadFailed: '状态加载失败',
      channelsLoadFailed: '渠道快照加载失败',
      runFailed: '手动检查失败',
      actionsLoadFailed: '动作队列加载失败',
      actionExecuteFailed: '动作执行失败',
      actionRejectFailed: '动作拒绝失败',
      settingsLoadFailed: '设置加载失败',
      settingsSaveFailed: '设置保存失败',
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
    actions: {
      title: 'AI 动作执行',
      queueTitle: '待处理动作',
      loading: '正在加载动作',
      empty: '当前没有动作',
      noTarget: '未指定目标',
      summary: '共 {count} 个动作',
      refresh: '刷新动作',
      execute: '执行',
      executing: '执行中',
      reject: '拒绝',
      risk: {
        low: '低风险',
        medium: '中风险',
        high: '高风险',
      },
      status: {
        queued: '待执行',
        pending_confirmation: '待确认',
        executing: '执行中',
        executed: '已执行',
        blocked: '已阻止',
        failed: '执行失败',
        rejected: '已拒绝',
      },
      labels: {
        test_channel: '测试渠道',
        notify_low_balance: '低余额提醒',
        create_channel: '创建渠道',
        update_channel: '修改渠道',
        disable_channel: '禁用渠道',
        delete_channel: '删除渠道',
      },
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
        testChannel: '测试渠道',
        createChannel: '创建渠道',
        updateChannel: '修改渠道',
        disableChannel: '禁用渠道',
        deleteChannel: '删除渠道',
      },
      prompt: {
        title: '提示词内容',
        includeBalance: '把余额纳入 AI 提示词',
        includeBalanceHint: '余额当前可能不准确；关闭后仍会在面板展示，但 AI 不会基于余额分析或建议。',
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
      actions: 'Actions',
      settings: 'Settings',
    },
    status: {
      ready: 'Ready',
      checking: 'Checking',
      error: 'Issue detected',
    },
    errors: {
      dismiss: 'Dismiss error',
      statusLoadFailed: 'Failed to load status',
      channelsLoadFailed: 'Failed to load channel snapshot',
      runFailed: 'Manual check failed',
      actionsLoadFailed: 'Failed to load actions',
      actionExecuteFailed: 'Failed to execute action',
      actionRejectFailed: 'Failed to reject action',
      settingsLoadFailed: 'Failed to load settings',
      settingsSaveFailed: 'Failed to save settings',
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
    actions: {
      title: 'AI Action Execution',
      queueTitle: 'Action queue',
      loading: 'Loading actions',
      empty: 'No actions right now',
      noTarget: 'No target',
      summary: '{count} actions in queue',
      refresh: 'Refresh actions',
      execute: 'Execute',
      executing: 'Executing',
      reject: 'Reject',
      risk: {
        low: 'Low risk',
        medium: 'Medium risk',
        high: 'High risk',
      },
      status: {
        queued: 'Queued',
        pending_confirmation: 'Needs confirmation',
        executing: 'Executing',
        executed: 'Executed',
        blocked: 'Blocked',
        failed: 'Failed',
        rejected: 'Rejected',
      },
      labels: {
        test_channel: 'Test channel',
        notify_low_balance: 'Low balance notice',
        create_channel: 'Create channel',
        update_channel: 'Update channel',
        disable_channel: 'Disable channel',
        delete_channel: 'Delete channel',
      },
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
        testChannel: 'Test channel',
        createChannel: 'Create channel',
        updateChannel: 'Update channel',
        disableChannel: 'Disable channel',
        deleteChannel: 'Delete channel',
      },
      prompt: {
        title: 'Prompt content',
        includeBalance: 'Include balance in AI prompt',
        includeBalanceHint: 'Balance may be inaccurate right now; when off, it stays visible in the panel but AI will not analyze or suggest from it.',
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
