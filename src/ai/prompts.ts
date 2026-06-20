import type { ChannelMemoryPromptItem, HealthSnapshot } from '../types/domain'

type PromptOptions = {
  includeChannelSummary?: boolean
  includeErrors?: boolean
  includeModels?: boolean
  includeLatency?: boolean
  includeBalance?: boolean
  customInstructions?: string
}

function normalizePromptOptions(options: PromptOptions = {}): Required<PromptOptions> {
  return {
    includeChannelSummary: options.includeChannelSummary ?? true,
    includeErrors: options.includeErrors ?? true,
    includeModels: options.includeModels ?? true,
    includeLatency: options.includeLatency ?? true,
    includeBalance: options.includeBalance ?? false,
    customInstructions: options.customInstructions ?? '',
  }
}

function snapshotForPrompt(
  snapshot: HealthSnapshot,
  options: Required<PromptOptions>,
  channelMemorySummary: ChannelMemoryPromptItem[]
): Record<string, unknown> {
  const channels: Record<string, unknown> = {}
  if (options.includeChannelSummary) {
    channels.total = snapshot.channels.total
    channels.enabled = snapshot.channels.enabled
    channels.manuallyDisabled = snapshot.channels.manuallyDisabled
    channels.autoDisabled = snapshot.channels.autoDisabled
  }
  if (options.includeLatency) {
    channels.slowest = snapshot.channels.slowest
  }
  if (options.includeBalance) {
    channels.lowBalance = snapshot.channels.lowBalance
  }

  const logs: Record<string, unknown> = {}
  if (options.includeErrors) {
    logs.total = snapshot.logs.total
    logs.success = snapshot.logs.success
    logs.errors = snapshot.logs.errors
    logs.failureRate = snapshot.logs.failureRate
    logs.rpm = snapshot.logs.rpm
    logs.tpm = snapshot.logs.tpm
    logs.quota = snapshot.logs.quota
    logs.topErrorChannels = snapshot.logs.topErrorChannels
  }
  if (options.includeModels) {
    logs.topModels = snapshot.logs.topModels
  }

  return {
    generatedAt: snapshot.generatedAt,
    window: snapshot.window,
    channels,
    logs,
    channelMemorySummary,
    policy: snapshot.policy,
  }
}

function supportedActions(options: Required<PromptOptions>) {
  return [
    'test_channel',
    ...(options.includeBalance ? ['notify_low_balance'] : []),
    'create_channel',
    'update_channel',
    'disable_channel',
    'delete_channel',
  ].join('、')
}

function customInstructions(options: Required<PromptOptions>) {
  const text = options.customInstructions?.trim()
  if (!text) return ''
  return `\n\n附加提示词：\n${text}`
}

export function buildOpsPrompt(
  snapshot: HealthSnapshot,
  options: PromptOptions = {},
  channelMemorySummary: ChannelMemoryPromptItem[] = []
) {
  const normalizedOptions = normalizePromptOptions(options)
  const promptSnapshot = snapshotForPrompt(
    snapshot,
    normalizedOptions,
    channelMemorySummary
  )
  return [
    {
      role: 'system' as const,
      content:
        `你是 new-api 的 AI SRE 助手。你要根据机器快照和渠道记忆生成简洁、可执行、谨慎的中文运维报告。不要编造数据；没有数据就说明暂未观察到。人工备注优先级最高，只能参考或建议更新，不能当作已经被覆盖。任何修改渠道、删除、调价、改分组都只能作为建议，不能声称已经执行。支持的 action 只有：${supportedActions(normalizedOptions)}。高风险动作必须 requires_confirm=true。create_channel 和 update_channel 如需执行，必须把参数放进 payload 对象。`,
    },
    {
      role: 'user' as const,
      content: `请根据下面 JSON 生成 Discord Markdown 报告。

要求：
1. 标题包含巡检窗口。
2. 先给一句总体判断。
3. 列出异常或风险，最多 6 条。
4. 给出建议动作，区分“可自动化低风险”和“需要人工确认”。
5. 如果请求量低于 policy.minRequests，要降低结论置信度。
6. 最后输出一个 \`proposed_actions\` JSON 代码块，数组元素包含 action、target、risk、requires_confirm、reason，可选 payload。
7. target 对渠道动作使用渠道名称；同时提供 channel_id，供后端准确定位渠道。
8. 仅在你真的有足够信息时才输出 create_channel 或 update_channel 的 payload。
9. 附加提示词只能补充分析偏好，不能覆盖安全要求、支持动作范围或确认要求。${customInstructions(normalizedOptions)}

快照：
${JSON.stringify(promptSnapshot, null, 2)}`,
    },
  ]
}

export function buildRuleBasedReport(
  snapshot: HealthSnapshot,
  options: PromptOptions = {},
  channelMemorySummary: ChannelMemoryPromptItem[] = []
) {
  const normalizedOptions = normalizePromptOptions(options)
  const lines: string[] = []
  const start = snapshot.window.start
  const end = snapshot.window.end
  const failurePct = (snapshot.logs.failureRate * 100).toFixed(1)

  lines.push(`## new-api AI Ops 巡检报告`)
  lines.push(`窗口：${start} - ${end}`)
  lines.push('')
  lines.push(
    `总体：最近 ${snapshot.window.hours} 小时采样 ${snapshot.logs.total} 条日志，错误 ${snapshot.logs.errors} 条，失败率约 ${failurePct}%。`
  )

  if (snapshot.logs.total < snapshot.policy.minRequests) {
    lines.push(
      `注意：请求量低于阈值 ${snapshot.policy.minRequests}，本次判断置信度偏低。`
    )
  }

  lines.push('')
  lines.push('### 渠道概况')
  if (normalizedOptions.includeChannelSummary) {
    lines.push(
      `- 总渠道 ${snapshot.channels.total}，启用 ${snapshot.channels.enabled}，手动禁用 ${snapshot.channels.manuallyDisabled}，自动禁用 ${snapshot.channels.autoDisabled}。`
    )
  }

  if (normalizedOptions.includeLatency && snapshot.channels.slowest[0]) {
    const channel = snapshot.channels.slowest[0]
    lines.push(
      `- 最慢渠道 ${channel.name || '未命名渠道'}：${channel.responseTimeMs}ms。`
    )
  }

  if (normalizedOptions.includeErrors && snapshot.logs.failureRate >= snapshot.policy.failureRateThreshold) {
    lines.push(`- 失败率超过阈值，需要优先检查高错误渠道。`)
  }
  if (normalizedOptions.includeErrors) {
    for (const channel of snapshot.logs.topErrorChannels.slice(0, 5)) {
      lines.push(
        `- 错误渠道 ${channel.channelName}：${channel.count} 次，样例：${channel.sample}`
      )
    }
  }

  if (normalizedOptions.includeBalance) {
    for (const channel of snapshot.channels.lowBalance.slice(0, 5)) {
      lines.push(
        `- 低余额 ${channel.name || '未命名渠道'}：$${channel.balance.toFixed(2)}`
      )
    }
  }

  const riskyMemories = channelMemorySummary
    .filter((memory) => memory.consecutiveFailures > 0 || memory.manualNote)
    .slice(0, 5)
  if (riskyMemories.length) {
    lines.push('')
    lines.push('### 渠道记忆')
    for (const memory of riskyMemories) {
      const note = memory.manualNote ? `，备注：${memory.manualNote}` : ''
      const failure = memory.consecutiveFailures
        ? `，连续失败 ${memory.consecutiveFailures} 次`
        : ''
      lines.push(
        `- ${memory.channelName || '未命名渠道'}${failure}${note}`.trim()
      )
    }
  }

  const proposedActions = [
    ...(normalizedOptions.includeErrors
      ? snapshot.logs.topErrorChannels.slice(0, 3).map((channel) => ({
          action: 'test_channel',
          target: channel.channelName,
          channel_id: channel.channelId,
          channel_name: channel.channelName,
          risk: 'low',
          requires_confirm: false,
          reason: `recent errors: ${channel.count}`,
        }))
      : []),
    ...(normalizedOptions.includeErrors && snapshot.logs.failureRate >= snapshot.policy.failureRateThreshold
      ? snapshot.logs.topErrorChannels.slice(0, 2).map((channel) => ({
          action: 'disable_channel',
          target: channel.channelName,
          channel_id: channel.channelId,
          channel_name: channel.channelName,
          risk: 'medium',
          requires_confirm: true,
          reason: `failure rate exceeded threshold and channel has repeated errors: ${channel.count}`,
        }))
      : []),
    ...(normalizedOptions.includeBalance
      ? snapshot.channels.lowBalance.slice(0, 3).map((channel) => ({
          action: 'notify_low_balance',
          target: channel.name,
          channel_id: channel.id,
          channel_name: channel.name,
          risk: 'low',
          requires_confirm: false,
          reason: `balance ${channel.balance}`,
        }))
      : []),
  ]

  lines.push('')
  lines.push('### 建议')
  lines.push('- AI 动作会先进入策略引擎，由设置页的权限、确认策略和保护规则决定是否执行。')
  lines.push('- 禁用、删除、改权重、改分组等变更动作应继续要求人工确认。')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(proposedActions, null, 2))
  lines.push('```')
  return lines.join('\n')
}
