import { loadConfig } from './config'
import { runOnce, startScheduler } from './scheduler/run'
import { OpsRuntime } from './runtime'
import { startPanelServer } from './web/server'

const args = new Set(Bun.argv.slice(2))
const mode =
  Bun.argv[2] === 'start' || Bun.argv[2] === 'panel' ? Bun.argv[2] : 'once'
const dryRun = args.has('--dry-run')
const config = loadConfig()
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
