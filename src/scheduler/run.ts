import type { AppConfig } from '../config'
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
  await runtime.startReportScheduler({
    dryRun: options.dryRun,
    sendDiscord: !options.dryRun,
    printReport: options.dryRun,
  })
}
