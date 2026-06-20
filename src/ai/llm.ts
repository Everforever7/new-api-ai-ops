import type { AppConfig } from '../config'
import type { HealthSnapshot } from '../types/domain'
import { loadEffectiveLlmConfig, loadOpsSettings } from '../settings'
import { buildOpsPrompt, buildRuleBasedReport } from './prompts'
import { getChannelMemoryPromptSummary } from '../testing'

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
  const settings = await loadOpsSettings()
  const llm = await loadEffectiveLlmConfig(config)
  const channelMemorySummary = await getChannelMemoryPromptSummary()
  const promptOptions = {
    includeChannelSummary: settings.prompt.includeChannelSummary,
    includeErrors: settings.prompt.includeErrors,
    includeModels: settings.prompt.includeModels,
    includeLatency: settings.prompt.includeLatency,
    includeBalance: settings.prompt.includeBalance,
    customInstructions: settings.prompt.customInstructions,
  }

  if (!llm.apiKey) {
    return buildRuleBasedReport(snapshot, promptOptions, channelMemorySummary)
  }

  const response = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey}`,
    },
    body: JSON.stringify({
      model: llm.model,
      messages: buildOpsPrompt(
        snapshot,
        promptOptions,
        channelMemorySummary
      ) satisfies ChatMessage[],
      temperature: llm.temperature,
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
