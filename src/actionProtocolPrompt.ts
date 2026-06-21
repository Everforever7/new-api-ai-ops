export function buildActionProtocolPrompt(supportedActions: string) {
  const actionSet = new Set(
    supportedActions
      .split(/[、,\s]+/g)
      .map((action) => action.trim())
      .filter(Boolean)
  )
  const lines = [
    '内置动作协议：',
    `1. 支持的 action 只有：${supportedActions}。不要输出未列出的 action。`,
    '2. 动作只是草案或建议，最终由后端权限、确认策略、保护规则、冷却规则和动作队列决定是否执行。',
    '3. proposed_actions 必须是 JSON 数组。每项包含 action、target、risk、requires_confirm、reason；渠道动作必须同时提供 channel_id。',
    '4. update_channel 只有在能给出明确 payload 时才能输出；如果只是“需要人工调整 API Key / 模型映射 / 价格 / 权限”，但没有确切新值，只写进文字建议，不要生成 update_channel。',
    '5. update_channel.payload 允许字段：status、weight、priority、group、tag、models、model_mapping、auto_ban、remark。status 数值：1=启用，2=手动禁用，3=自动禁用。key 不是 update_channel 可更新字段，不要把 key 放进 update_channel.payload。',
    '6. 开启渠道使用 update_channel，payload 只包含 {"status":1}；只有这种 update_channel 可能被视为自动启停维护动作。禁用渠道优先使用 disable_channel。',
    '7. 修改模型映射时，只有知道准确映射才输出 payload.model_mapping；可以是对象或 JSON 字符串。models、group 可以是逗号分隔字符串或数组。',
    '8. create_channel 必须提供 payload，格式为 {"mode":"single","channel":{...}}；channel 至少包含 name、type、key、base_url、models，可选 group、tag、weight、priority、auto_ban、model_mapping、openai_organization、test_model、remark。创建渠道必须 requires_confirm=true。',
    '9. disable_channel、delete_channel 不需要 payload；delete_channel 必须 requires_confirm=true。',
  ]

  let nextRuleNumber = 10
  if (actionSet.has('delete_channel')) {
    lines.push(`${nextRuleNumber++}. 如果渠道明确出现 API Key / 凭证类错误（例如无可用凭证、invalid token、not authorized、API key 无效或过期），且无法给出可执行修复 payload，可以输出 delete_channel 草案交给人工判断；risk 使用 medium 或 high，requires_confirm 必须为 true，reason 必须说明错误证据、连续失败次数或最近测试结果。不要为同一问题输出没有 payload 的 update_channel。`)
  }
  if (actionSet.has('test_channel')) {
    lines.push(`${nextRuleNumber++}. test_channel 可选 payload: {"model":"具体模型名"}。`)
  }
  if (actionSet.has('notify_low_balance')) {
    lines.push(`${nextRuleNumber++}. notify_low_balance 不需要 payload，用于记录低余额通知建议。`)
  }

  return lines.join('\n')
}
