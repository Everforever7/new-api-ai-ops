import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Database } from 'bun:sqlite'
import { DEFAULT_DB_PATH } from '../defaults'

const DB_PATH = process.env.AI_OPS_DB_PATH?.trim() || DEFAULT_DB_PATH

type Row<T = unknown> = Record<string, T>

let db: Database | undefined

function now() {
  return new Date().toISOString()
}

function database() {
  if (db) return db

  const dbDir = dirname(DB_PATH)
  if (dbDir && dbDir !== '.') {
    mkdirSync(dbDir, { recursive: true })
  }
  db = new Database(DB_PATH)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS action_audit (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      channel_id INTEGER,
      status TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT,
      executed_at TEXT,
      audit_time INTEGER NOT NULL,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_action_audit_time
      ON action_audit (audit_time DESC);
    CREATE INDEX IF NOT EXISTS idx_action_audit_cooldown
      ON action_audit (channel_id, action, status, executed_at);

    CREATE TABLE IF NOT EXISTS app_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      meta TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_app_logs_timestamp
      ON app_logs (timestamp DESC);

    CREATE TABLE IF NOT EXISTS channel_test_runs (
      id TEXT PRIMARY KEY,
      channel_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      triggered_by TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      ended_at_ms INTEGER NOT NULL,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_channel_test_runs_channel
      ON channel_test_runs (channel_id, ended_at_ms DESC);

    CREATE TABLE IF NOT EXISTS channel_memory (
      channel_id INTEGER PRIMARY KEY,
      updated_at TEXT NOT NULL,
      json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      name TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      mtime_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reports_mtime
      ON reports (mtime_ms DESC);

    CREATE TABLE IF NOT EXISTS newapi_sessions (
      key TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      json TEXT NOT NULL
    );
  `)

  return db
}

function stringify(value: unknown) {
  return JSON.stringify(value)
}

function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== 'string') return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

function timestampMs(value: unknown) {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function loadJsonValue<T>(key: string): T | undefined {
  const row = database()
    .query('SELECT value FROM kv_store WHERE key = ?')
    .get(key) as Row<string> | null
  return parseJson<T>(row?.value)
}

export function saveJsonValue(key: string, value: unknown) {
  database()
    .query(`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `)
    .run(key, stringify(value), now())
}

export function deleteJsonValue(key: string) {
  database().query('DELETE FROM kv_store WHERE key = ?').run(key)
}

export function appendActionAuditRecord(action: Record<string, unknown>) {
  database()
    .query(`
      INSERT OR REPLACE INTO action_audit
        (id, action, channel_id, status, created_at, updated_at, executed_at, audit_time, json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      String(action.id || ''),
      String(action.action || ''),
      action.channelId === undefined ? null : Number(action.channelId),
      String(action.status || ''),
      stringOrNull(action.createdAt),
      stringOrNull(action.updatedAt),
      stringOrNull(action.executedAt),
      timestampMs(action.executedAt || action.updatedAt || action.createdAt),
      stringify(action)
    )
}

export function listActionAuditRecords(limit: number) {
  const rows = database()
    .query(`
      SELECT json FROM action_audit
      ORDER BY audit_time DESC, id DESC
      LIMIT ?
    `)
    .all(limit) as Array<Row<string>>
  return rows.map((row) => parseJson(row.json)).filter(Boolean)
}

export function pruneActionAuditRecords(maxEntries: number) {
  database()
    .query(`
      DELETE FROM action_audit
      WHERE id NOT IN (
        SELECT id FROM action_audit
        ORDER BY audit_time DESC, id DESC
        LIMIT ?
      )
    `)
    .run(Math.max(1, Math.floor(maxEntries)))
}

export function hasRecentExecutedAction(
  channelId: number,
  action: string,
  cutoffMs: number
) {
  const row = database()
    .query(`
      SELECT 1 FROM action_audit
      WHERE channel_id = ?
        AND action = ?
        AND status = 'executed'
        AND executed_at IS NOT NULL
        AND audit_time >= ?
      LIMIT 1
    `)
    .get(channelId, action, cutoffMs)
  return Boolean(row)
}

export function appendAppLogRecord(entry: Record<string, unknown>) {
  database()
    .query(`
      INSERT OR REPLACE INTO app_logs
        (id, timestamp, level, message, meta, json)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      String(entry.id || ''),
      String(entry.timestamp || now()),
      String(entry.level || 'info'),
      String(entry.message || ''),
      entry.meta === undefined ? null : stringify(entry.meta),
      stringify(entry)
    )
}

export function listAppLogRecords(limit: number) {
  const rows = database()
    .query(`
      SELECT json FROM app_logs
      ORDER BY timestamp DESC, id DESC
      LIMIT ?
    `)
    .all(limit) as Array<Row<string>>
  return rows.map((row) => parseJson(row.json)).filter(Boolean)
}

export function pruneAppLogRecords(maxEntries: number) {
  database()
    .query(`
      DELETE FROM app_logs
      WHERE id NOT IN (
        SELECT id FROM app_logs
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
      )
    `)
    .run(Math.max(1, Math.floor(maxEntries)))
}

export function appendChannelTestRuns(runs: Array<Record<string, unknown>>) {
  if (!runs.length) return
  const insert = database().prepare(`
    INSERT OR REPLACE INTO channel_test_runs
      (id, channel_id, status, triggered_by, started_at, ended_at, ended_at_ms, json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const tx = database().transaction((items: Array<Record<string, unknown>>) => {
    for (const run of items) {
      insert.run(
        String(run.id || ''),
        Number(run.channelId),
        String(run.status || ''),
        String(run.triggeredBy || 'manual'),
        String(run.startedAt || now()),
        String(run.endedAt || now()),
        timestampMs(run.endedAt || run.startedAt),
        stringify(run)
      )
    }
  })
  tx(runs)
}

export function listChannelTestRunRecords(options: {
  channelId?: number
  limit: number
}) {
  const rows = options.channelId
    ? database()
        .query(`
          SELECT json FROM channel_test_runs
          WHERE channel_id = ?
          ORDER BY ended_at_ms DESC, id DESC
          LIMIT ?
        `)
        .all(options.channelId, options.limit)
    : database()
        .query(`
          SELECT json FROM channel_test_runs
          ORDER BY ended_at_ms DESC, id DESC
          LIMIT ?
        `)
        .all(options.limit)
  return (rows as Array<Row<string>>)
    .map((row) => parseJson(row.json))
    .filter(Boolean)
}

export function pruneChannelTestRuns(
  historyLimit: number,
  validChannelIds?: Set<number>
) {
  const validRows = database()
    .query('SELECT id, channel_id, ended_at_ms FROM channel_test_runs')
    .all() as Array<Row<string | number>>
  const grouped = new Map<number, Array<Row<string | number>>>()
  const staleIds: string[] = []

  for (const row of validRows) {
    const channelId = Number(row.channel_id)
    if (validChannelIds && !validChannelIds.has(channelId)) {
      staleIds.push(String(row.id))
      continue
    }
    const list = grouped.get(channelId) || []
    list.push(row)
    grouped.set(channelId, list)
  }

  const limit = Math.max(1, Math.floor(historyLimit))
  for (const rows of grouped.values()) {
    rows
      .sort((a, b) => Number(b.ended_at_ms) - Number(a.ended_at_ms))
      .slice(limit)
      .forEach((row) => staleIds.push(String(row.id)))
  }

  deleteByIds('channel_test_runs', staleIds)
}

export function loadChannelMemoryRecords() {
  const rows = database()
    .query('SELECT json FROM channel_memory ORDER BY channel_id ASC')
    .all() as Array<Row<string>>
  return rows.map((row) => parseJson(row.json)).filter(Boolean)
}

export function replaceChannelMemoryRecords(memories: Array<Record<string, unknown>>) {
  const table = database()
  const tx = table.transaction((items: Array<Record<string, unknown>>) => {
    table.query('DELETE FROM channel_memory').run()
    const insert = table.prepare(`
      INSERT INTO channel_memory (channel_id, updated_at, json)
      VALUES (?, ?, ?)
    `)
    for (const memory of items) {
      insert.run(
        Number(memory.channelId),
        String(memory.updatedAt || now()),
        stringify(memory)
      )
    }
  })
  tx(memories)
}

export function saveReportRecord(saveDir: string, content: string) {
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}.md`
  const path = join(saveDir, name)
  const timestamp = Date.now()
  database()
    .query(`
      INSERT INTO reports (name, path, content, mtime_ms, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(name, path, content, timestamp, now())
  return path
}

export function listReportRecords() {
  return database()
    .query(`
      SELECT name, path, mtime_ms AS mtimeMs, content
      FROM reports
      ORDER BY mtime_ms DESC, name DESC
    `)
    .all()
}

export function pruneReportRecords(maxReports: number) {
  database()
    .query(`
      DELETE FROM reports
      WHERE name NOT IN (
        SELECT name FROM reports
        ORDER BY mtime_ms DESC, name DESC
        LIMIT ?
      )
    `)
    .run(Math.max(1, Math.floor(maxReports)))
}

export function loadNewApiSession<T>(key: string): T | undefined {
  const row = database()
    .query('SELECT json FROM newapi_sessions WHERE key = ?')
    .get(key) as Row<string> | null
  return parseJson<T>(row?.json)
}

export function saveNewApiSession(
  key: string,
  session: Record<string, unknown>
) {
  database()
    .query(`
      INSERT INTO newapi_sessions (key, updated_at, json)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        updated_at = excluded.updated_at,
        json = excluded.json
    `)
    .run(key, String(session.updatedAt || now()), stringify(session))
}

export function deleteNewApiSession(key: string) {
  database().query('DELETE FROM newapi_sessions WHERE key = ?').run(key)
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' ? value : null
}

function deleteByIds(table: string, ids: string[]) {
  if (!ids.length) return
  const statement = database().prepare(`DELETE FROM ${table} WHERE id = ?`)
  const tx = database().transaction((items: string[]) => {
    for (const id of items) statement.run(id)
  })
  tx(ids)
}
