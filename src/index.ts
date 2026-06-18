import { loadConfig } from './config'
import { runOnce, startScheduler } from './scheduler/run'

const args = new Set(Bun.argv.slice(2))
const mode = Bun.argv[2] === 'start' ? 'start' : 'once'
const dryRun = args.has('--dry-run')
const config = loadConfig()

if (mode === 'start') {
  await startScheduler(config, { dryRun })
} else {
  await runOnce(config, { dryRun })
}
