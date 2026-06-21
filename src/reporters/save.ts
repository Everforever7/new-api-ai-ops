import {
  listReportRecords,
  pruneReportRecords,
  saveReportRecord,
} from '../storage/db'

export async function saveReport(saveDir: string, report: string) {
  return saveReportRecord(saveDir, report)
}

export async function pruneReports(saveDir: string, maxReports: number) {
  void saveDir
  pruneReportRecords(maxReports)
}

export async function listReports() {
  return listReportRecords()
}
