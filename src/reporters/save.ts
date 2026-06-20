import { mkdir, readdir, rm, stat } from 'node:fs/promises'
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

export async function pruneReports(saveDir: string, maxReports: number) {
  const limit = Math.max(1, Math.floor(maxReports))

  try {
    const entries = await readdir(saveDir, { withFileTypes: true })
    const reports = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map(async (entry) => {
          const path = join(saveDir, entry.name)
          const info = await stat(path)
          return { name: entry.name, path, mtimeMs: info.mtimeMs }
        })
    )

    const stale = reports
      .sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name))
      .slice(limit)

    await Promise.all(stale.map((report) => rm(report.path, { force: true })))
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error
  }
}
