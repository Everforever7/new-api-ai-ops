import { loadConfig } from './config'
import { runOnce, startScheduler } from './scheduler/run'
import { OpsRuntime } from './runtime'
import { startPanelServer } from './web/server'
import { configureAppLogger, logger, pruneAppLogs } from './logger'
import { loadOpsSettings } from './settings'

const args = new Set(Bun.argv.slice(2))
const mode =
  Bun.argv[2] === 'start' || Bun.argv[2] === 'panel' ? Bun.argv[2] : 'once'
const dryRun = args.has('--dry-run')
const config = loadConfig()
try {
  const settings = await loadOpsSettings()
  configureAppLogger({ maxEntries: settings.storage.maxAppLogEntries })
  await pruneAppLogs(settings.storage.maxAppLogEntries)
} catch (error) {
  logger.warn('failed to initialize app log retention', error)
}
const runtime = new OpsRuntime(config)

if (mode === 'start') {
  startPanelServer(config, runtime)
  await runtime.refreshActiveTestingScheduler()
  await startScheduler(config, { dryRun }, runtime)
} else if (mode === 'panel') {
  startPanelServer(config, runtime)
  await runtime.refreshActiveTestingScheduler()
} else {
  await runOnce(config, { dryRun })
}
