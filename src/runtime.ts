import type { AppConfig } from './config'
import type { HealthSnapshot } from './types/domain'
import { generateOpsReport } from './ai/llm'
import { collectHealthSnapshot } from './newapi/health'
import { sendDiscordReport } from './reporters/discord'
import { saveReport } from './reporters/save'
import { logger } from './logger'
import {
  buildAssistantActionDrafts,
  buildActionQueue,
  confirmAndExecuteAction,
  rejectAction,
  sanitizeActionForClient,
  type OpsAction,
} from './actions'
import {
  createAssistantMessage,
  planAssistantTurn,
  planAssistantResponse,
  prepareAssistantTurn,
  type AssistantSecret,
  type AssistantMessage,
} from './assistant'

export type AssistantStreamOptions = {
  userMessageId?: string
  assistantMessageId?: string
}

export type AssistantStreamEvent =
  | { type: 'message'; message: AssistantMessage }
  | { type: 'delta'; id: string; delta: string }
  | {
      type: 'done'
      session: ReturnType<OpsRuntime['getAssistantSession']> & {
        missingFields?: string[]
      }
    }

export type RunReportOptions = {
  dryRun?: boolean
  sendDiscord?: boolean
  printReport?: boolean
}

export type RunReportResult = {
  snapshot: HealthSnapshot
  report: string
  reportPath: string
  sentDiscord: boolean
  actions: OpsAction[]
  completedAt: string
}

export class OpsRuntime {
  private running = false
  private lastResult?: RunReportResult
  private lastError?: string
  private actions: OpsAction[] = []
  private assistantMessages: AssistantMessage[] = []
  private assistantSecrets: AssistantSecret[] = []
  private assistantLastActions: OpsAction[] = []
  private assistantUpdatedAt?: string
  private readonly startedAt = new Date().toISOString()

  constructor(private readonly config: AppConfig) {}

  getState() {
    return {
      startedAt: this.startedAt,
      running: this.running,
      lastRunAt: this.lastResult?.completedAt,
      lastReportPath: this.lastResult?.reportPath,
      lastError: this.lastError,
      lastSnapshot: this.lastResult?.snapshot,
      lastReport: this.lastResult?.report,
      lastActions: this.getActions(),
    }
  }

  getActions() {
    return this.actions.map(sanitizeActionForClient)
  }

  getAssistantSession() {
    return {
      messages: this.assistantMessages,
      lastActions: this.assistantLastActions.map(sanitizeActionForClient),
      updatedAt: this.assistantUpdatedAt,
    }
  }

  resetAssistantSession() {
    this.assistantMessages = []
    this.assistantSecrets = []
    this.assistantLastActions = []
    this.assistantUpdatedAt = new Date().toISOString()
    return this.getAssistantSession()
  }

  async sendAssistantMessage(input: string) {
    const message = input.trim()
    if (!message) {
      throw new Error('assistant message is empty')
    }

    const plan = await planAssistantTurn(
      this.config,
      this.assistantMessages,
      message,
      this.assistantSecrets
    )
    const drafts = await buildAssistantActionDrafts(this.config, plan.rawActions)
    this.assistantSecrets = plan.secrets
    this.actions = [...drafts, ...this.actions]
    this.assistantLastActions = drafts
    this.assistantMessages = [
      ...this.assistantMessages,
      plan.userMessage,
      plan.assistantMessage,
    ].slice(-80)
    this.assistantUpdatedAt = new Date().toISOString()

    return {
      ...this.getAssistantSession(),
      missingFields: plan.missingFields,
    }
  }

  async streamAssistantMessage(
    input: string,
    options: AssistantStreamOptions,
    emit: (event: AssistantStreamEvent) => void | Promise<void>
  ) {
    const message = input.trim()
    if (!message) {
      throw new Error('assistant message is empty')
    }

    const history = this.assistantMessages
    const prepared = prepareAssistantTurn(
      message,
      this.assistantSecrets,
      { userMessageId: options.userMessageId }
    )
    const assistantMessage = createAssistantMessage(
      'assistant',
      '',
      options.assistantMessageId
    )

    this.assistantLastActions = []
    this.assistantMessages = [
      ...this.assistantMessages,
      prepared.userMessage,
      assistantMessage,
    ].slice(-80)
    this.assistantUpdatedAt = new Date().toISOString()

    await emit({ type: 'message', message: prepared.userMessage })
    await emit({ type: 'message', message: assistantMessage })

    const updateAssistantContent = (content: string) => {
      this.assistantMessages = this.assistantMessages.map((item) =>
        item.id === assistantMessage.id
          ? { ...item, content }
          : item
      )
    }

    let streamedContent = ''
    const plan = await planAssistantResponse(
      this.config,
      history,
      prepared,
      {
        assistantMessage,
        onReplyDelta: async (delta) => {
          streamedContent += delta
          updateAssistantContent(streamedContent)
          await emit({ type: 'delta', id: assistantMessage.id, delta })
        },
      }
    )
    const drafts = await buildAssistantActionDrafts(this.config, plan.rawActions)

    this.assistantSecrets = plan.secrets
    this.actions = [...drafts, ...this.actions]
    this.assistantLastActions = drafts
    updateAssistantContent(plan.assistantMessage.content)
    this.assistantUpdatedAt = new Date().toISOString()

    await emit({ type: 'message', message: plan.assistantMessage })

    const session = {
      ...this.getAssistantSession(),
      missingFields: plan.missingFields,
    }
    await emit({ type: 'done', session })
    return session
  }

  async executeAction(actionId: string) {
    const action = this.actions.find((item) => item.id === actionId)
    if (!action) {
      throw new Error(`action not found: ${actionId}`)
    }

    const next = await confirmAndExecuteAction(this.config, action)
    this.replaceAction(next)
    return sanitizeActionForClient(next)
  }

  async rejectAction(actionId: string) {
    const action = this.actions.find((item) => item.id === actionId)
    if (!action) {
      throw new Error(`action not found: ${actionId}`)
    }

    const next = await rejectAction(action)
    this.replaceAction(next)
    return sanitizeActionForClient(next)
  }

  private replaceAction(action: OpsAction) {
    this.actions = this.actions.map((item) =>
      item.id === action.id ? action : item
    )

    if (this.lastResult) {
      this.lastResult = {
        ...this.lastResult,
        actions: this.lastResult.actions.map((item) =>
          item.id === action.id ? action : item
        ),
      }
    }

    this.assistantLastActions = this.assistantLastActions.map((item) =>
      item.id === action.id ? action : item
    )
  }

  async runReport(options: RunReportOptions = {}) {
    if (this.running) {
      throw new Error('a report run is already in progress')
    }

    const dryRun = options.dryRun === true
    const sendDiscord = options.sendDiscord ?? !dryRun
    const printReport = options.printReport ?? dryRun

    this.running = true
    this.lastError = undefined
    try {
      logger.info('collecting new-api health snapshot')
      const snapshot = await collectHealthSnapshot(this.config)

      logger.info('generating AI ops report')
      const report = await generateOpsReport(this.config, snapshot)
      const reportPath = await saveReport(this.config.report.saveDir, report)
      logger.info(`saved report: ${reportPath}`)

      logger.info('planning AI actions')
      const actions = await buildActionQueue(this.config, snapshot, report)
      const assistantActions = this.actions.filter(
        (action) => action.source === 'assistant'
      )
      this.actions = [...assistantActions, ...actions]

      let sentDiscord = false
      if (sendDiscord) {
        await sendDiscordReport(report, {
          webhookUrl: this.config.discord.webhookUrl,
          dryRun: false,
        })
        sentDiscord = Boolean(this.config.discord.webhookUrl)
      } else if (printReport) {
        console.log(report)
      }

      const result: RunReportResult = {
        snapshot,
        report,
        reportPath,
        sentDiscord,
        actions,
        completedAt: new Date().toISOString(),
      }
      this.lastResult = result
      logger.info(sentDiscord ? 'report sent' : 'report generated')
      return {
        ...result,
        actions: actions.map(sanitizeActionForClient),
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      this.running = false
    }
  }
}
