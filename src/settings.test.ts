import { describe, expect, test } from 'bun:test'
import { normalizeOpsSettings } from './settings'

describe('normalizeOpsSettings', () => {
  test('migrates existing settings to approval-first token inspection defaults', () => {
    const settings = normalizeOpsSettings({ version: 1 })

    expect(settings.tokenInspection.enabled).toBe(false)
    expect(settings.tokenInspection.intervalMinutes).toBe(60)
    expect(settings.tokenInspection.allowedClients).toEqual(['酒馆', 'tt酒馆'])
    expect(settings.aiExecution.permissions.disableUser).toBe(true)
    expect(settings.aiExecution.confirmation.disableUser).toBe('confirm')
  })

  test('keeps the automatic user-disable threshold in the high-confidence range', () => {
    const settings = normalizeOpsSettings({
      version: 1,
      tokenInspection: { autoDisableConfidence: 0.5 },
    })

    expect(settings.tokenInspection.autoDisableConfidence).toBe(0.98)
  })
})
