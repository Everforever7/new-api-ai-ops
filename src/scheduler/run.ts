import type { AppConfig } from '../config'
import { generateOpsReport } from '../ai/llm'
import { collectHealthSnapshot } from '../newapi/health'
import { sendDiscordReport } from '../reporters/discord'
import { saveReport } from '../reporters/save'
import { logger } from '../logger'

export async function runOnce(config: AppConfig, options = { dryRun: false }) {
  logger.info('collecting new-api health snapshot')
  const snapshot = await collectHealthSnapshot(config)

  logger.info('generating AI ops report')
  const report = await generateOpsReport(config, snapshot)
  const reportPath = await saveReport(config.report.saveDir, report)
  logger.info(`saved report: ${reportPath}`)

  await sendDiscordReport(report, {
    webhookUrl: config.discord.webhookUrl,
    dryRun: options.dryRun,
  })
  logger.info(options.dryRun ? 'dry-run report printed' : 'report sent')
}

export async function startScheduler(
  config: AppConfig,
  options = { dryRun: false }
) {
  let running = false

  const tick = async () => {
    if (running) {
      logger.warn('previous run is still active, skipping this tick')
      return
    }

    running = true
    try {
      await runOnce(config, options)
    } catch (error) {
      logger.error('scheduled run failed', error)
    } finally {
      running = false
    }
  }

  await tick()
  const intervalMs = Math.max(1, config.report.intervalMinutes) * 60 * 1000
  logger.info(`scheduler started; interval=${config.report.intervalMinutes}m`)
  setInterval(tick, intervalMs)
}
