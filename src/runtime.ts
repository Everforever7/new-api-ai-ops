import type { AppConfig } from './config'
import type { HealthSnapshot } from './types/domain'
import { generateOpsReport } from './ai/llm'
import { collectHealthSnapshot } from './newapi/health'
import { sendDiscordReport } from './reporters/discord'
import { saveReport } from './reporters/save'
import { logger } from './logger'
import {
  buildActiveTestActionDrafts,
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
import { loadOpsSettings } from './settings'
import {
  runChannelTests as runChannelTestsNow,
  type RunChannelTestsOptions,
} from './testing'

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
  private activeTestingRunning = false
  private activeTestingTimer?: ReturnType<typeof setInterval>
  private activeTestingScheduleKey = ''
  private lastResult?: RunReportResult
  private lastError?: string
  private actions: OpsAction[] = []
  private assistantMessages: AssistantMessage[] = []
  private assistantSecrets: AssistantSecret[] = []
  private assistantLastActions: OpsAction[] = []
  private assistantLastMemorySummary: unknown[] = []
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
      activeTestingRunning: this.activeTestingRunning,
    }
  }

  getActions() {
    return this.actions.map(sanitizeActionForClient)
  }

  getAssistantSession() {
    return {
      messages: this.assistantMessages,
      lastActions: this.assistantLastActions.map(sanitizeActionForClient),
      lastMemorySummary: this.assistantLastMemorySummary,
      updatedAt: this.assistantUpdatedAt,
    }
  }

  resetAssistantSession() {
    this.assistantMessages = []
    this.assistantSecrets = []
    this.assistantLastActions = []
    this.assistantLastMemorySummary = []
    this.assistantUpdatedAt = new Date().toISOString()
    return this.getAssistantSession()
  }

  async refreshActiveTestingScheduler() {
    const settings = await loadOpsSettings()
    const scheduleKey = JSON.stringify(settings.activeTesting)
    if (scheduleKey === this.activeTestingScheduleKey) return

    if (this.activeTestingTimer) {
      clearInterval(this.activeTestingTimer)
      this.activeTestingTimer = undefined
    }

    this.activeTestingScheduleKey = scheduleKey
    if (!settings.activeTesting.enabled) {
      logger.info('active channel testing disabled')
      return
    }

    const intervalMs =
      Math.max(1, settings.activeTesting.intervalMinutes) * 60 * 1000
    this.activeTestingTimer = setInterval(() => {
      void this.runScheduledChannelTests()
    }, intervalMs)
    logger.info(
      `active channel testing scheduled; interval=${settings.activeTesting.intervalMinutes}m`
    )
  }

  private async runScheduledChannelTests() {
    try {
      await this.runChannelTests({ triggeredBy: 'scheduled' })
    } catch (error) {
      logger.error('scheduled channel testing failed', error)
    }
  }

  async runChannelTests(options: RunChannelTestsOptions = {}) {
    if (this.activeTestingRunning) {
      throw new Error('channel tests are already running')
    }

    this.activeTestingRunning = true
    try {
      const result = await runChannelTestsNow(this.config, options)
      const settings = await loadOpsSettings()
      const drafts = await buildActiveTestActionDrafts(
        this.config,
        result.memories,
        settings.activeTesting.failureThreshold
      )
      const nextDrafts = drafts.filter((draft) => !this.hasOpenActionLike(draft))
      this.actions = [...nextDrafts, ...this.actions]

      return {
        ...result,
        actions: nextDrafts.map(sanitizeActionForClient),
      }
    } finally {
      this.activeTestingRunning = false
    }
  }

  private hasOpenActionLike(action: OpsAction) {
    return this.actions.some((item) => {
      return (
        item.source === 'active_test' &&
        item.action === action.action &&
        item.channelId === action.channelId &&
        item.status !== 'executed' &&
        item.status !== 'rejected'
      )
    })
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
    this.assistantLastMemorySummary = plan.memorySummary
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
    this.assistantLastMemorySummary = []
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
    this.assistantLastMemorySummary = plan.memorySummary
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
