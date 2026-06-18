import type { AppConfig } from '../config'
import type { HealthSnapshot } from '../types/domain'
import { buildOpsPrompt, buildRuleBasedReport } from './prompts'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

export async function generateOpsReport(
  config: AppConfig,
  snapshot: HealthSnapshot
) {
  if (!config.llm.apiKey) {
    return buildRuleBasedReport(snapshot)
  }

  const response = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages: buildOpsPrompt(snapshot) satisfies ChatMessage[],
      temperature: config.llm.temperature,
    }),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `LLM ${response.status} ${response.statusText}: ${text.slice(0, 500)}`
    )
  }

  const json = JSON.parse(text) as ChatCompletionResponse
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error('LLM response did not include message content')
  }
  return content
}
