import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

export async function saveReport(saveDir: string, report: string) {
  await mkdir(saveDir, { recursive: true })
  const path = join(saveDir, `${safeTimestamp()}.md`)
  await Bun.write(path, report)
  return path
}
