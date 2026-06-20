export const REPORT_TONE_COUNT = 12

function normalizeToneIndex(index) {
  const value = Number(index)
  if (!Number.isFinite(value)) return 0
  return ((Math.floor(value) % REPORT_TONE_COUNT) + REPORT_TONE_COUNT) % REPORT_TONE_COUNT
}

function fallbackToneIndex(value) {
  const text = String(value || '')
  let hash = 0
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return hash % REPORT_TONE_COUNT
}

export function buildReportToneMap(reports = []) {
  const map = new Map()
  reports.forEach((report, index) => {
    if (report?.name) {
      map.set(report.name, normalizeToneIndex(index))
    }
  })
  return map
}

export function reportToneIndex(reportName, reportToneByName, fallbackValue) {
  if (reportName && reportToneByName?.has(reportName)) {
    return reportToneByName.get(reportName)
  }
  return fallbackToneIndex(fallbackValue || reportName)
}
