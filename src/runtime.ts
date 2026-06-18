import type { AppConfig } from './config'
import type { HealthSnapshot } from './types/domain'
import { generateOpsReport } from './ai/llm'
import { collectHealthSnapshot } from './newapi/health'
import { sendDiscordReport } from './reporters/discord'
import { saveReport } from './reporters/save'
import { logger } from './logger'

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
  completedAt: string
}

export class OpsRuntime {
  private running = false
  private lastResult?: RunReportResult
  private lastError?: string
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
    }
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
        completedAt: new Date().toISOString(),
      }
      this.lastResult = result
      logger.info(sentDiscord ? 'report sent' : 'report generated')
      return result
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      this.running = false
    }
  }
}
