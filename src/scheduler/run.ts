import type { AppConfig } from '../config'
import { logger } from '../logger'
import { OpsRuntime } from '../runtime'

export async function runOnce(config: AppConfig, options = { dryRun: false }) {
  return new OpsRuntime(config).runReport({
    dryRun: options.dryRun,
    sendDiscord: !options.dryRun,
    printReport: options.dryRun,
  })
}

export async function startScheduler(
  config: AppConfig,
  options = { dryRun: false },
  runtime = new OpsRuntime(config)
) {
  const tick = async () => {
    try {
      await runtime.runReport({
        dryRun: options.dryRun,
        sendDiscord: !options.dryRun,
        printReport: options.dryRun,
      })
    } catch (error) {
      logger.error('scheduled run failed', error)
    }
  }

  await tick()
  const intervalMs = Math.max(1, config.report.intervalMinutes) * 60 * 1000
  logger.info(`scheduler started; interval=${config.report.intervalMinutes}m`)
  setInterval(tick, intervalMs)
}
