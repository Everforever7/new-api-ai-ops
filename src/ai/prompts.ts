import type { HealthSnapshot } from '../types/domain'

export function buildOpsPrompt(snapshot: HealthSnapshot) {
  return [
    {
      role: 'system' as const,
      content:
        '你是 new-api 的 AI SRE 助手。你要根据机器快照生成简洁、可执行、谨慎的中文运维报告。不要编造数据；没有数据就说明暂未观察到。任何修改渠道、删除、调价、改分组都只能作为建议，不能声称已经执行。',
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
6. 最后输出一个 \`proposed_actions\` JSON 代码块，数组元素包含 action、target、risk、requires_confirm、reason。

快照：
${JSON.stringify(snapshot, null, 2)}`,
    },
  ]
}

export function buildRuleBasedReport(snapshot: HealthSnapshot) {
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
  lines.push(
    `- 总渠道 ${snapshot.channels.total}，启用 ${snapshot.channels.enabled}，手动禁用 ${snapshot.channels.manuallyDisabled}，自动禁用 ${snapshot.channels.autoDisabled}。`
  )

  if (snapshot.logs.failureRate >= snapshot.policy.failureRateThreshold) {
    lines.push(`- 失败率超过阈值，需要优先检查高错误渠道。`)
  }
  for (const channel of snapshot.logs.topErrorChannels.slice(0, 5)) {
    lines.push(
      `- 错误渠道 #${channel.channelId} ${channel.channelName}：${channel.count} 次，样例：${channel.sample}`
    )
  }
  for (const channel of snapshot.channels.lowBalance.slice(0, 5)) {
    lines.push(
      `- 低余额 #${channel.id} ${channel.name}：$${channel.balance.toFixed(2)}`
    )
  }

  const proposedActions = [
    ...snapshot.logs.topErrorChannels.slice(0, 3).map((channel) => ({
      action: 'inspect_channel_errors',
      target: `channel:${channel.channelId}`,
      risk: 'low',
      requires_confirm: false,
      reason: `recent errors: ${channel.count}`,
    })),
    ...snapshot.channels.lowBalance.slice(0, 3).map((channel) => ({
      action: 'notify_low_balance',
      target: `channel:${channel.id}`,
      risk: 'low',
      requires_confirm: false,
      reason: `balance ${channel.balance}`,
    })),
  ]

  lines.push('')
  lines.push('### 建议')
  lines.push('- 当前版本只汇报，不自动修改渠道。')
  lines.push('- 禁用、删除、改权重、改分组应继续要求人工确认。')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(proposedActions, null, 2))
  lines.push('```')
  return lines.join('\n')
}
