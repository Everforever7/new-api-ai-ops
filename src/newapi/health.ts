import type { AppConfig } from '../config'
import type { Channel, HealthSnapshot, UsageLog } from '../types/domain'
import { NewApiClient } from './client'

const LOG_TYPE_CONSUME = 2
const LOG_TYPE_ERROR = 5
const CHANNEL_STATUS_ENABLED = 1
const CHANNEL_STATUS_MANUAL_DISABLED = 2
const CHANNEL_STATUS_AUTO_DISABLED = 3

function countBy<T>(
  items: T[],
  keyFn: (item: T) => string
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = keyFn(item)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

function topEntries(counts: Map<string, number>, limit: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

function contentSample(logs: UsageLog[]) {
  const sample = logs.find((log) => log.content?.trim())
  return sample?.content?.trim().slice(0, 180) || 'no error sample'
}

function buildTopErrorChannels(logs: UsageLog[], channels: Channel[]) {
  const errors = logs.filter((log) => log.type === LOG_TYPE_ERROR)
  const channelNameById = new Map(
    channels.map((channel) => [channel.id, channel.name] as const)
  )
  const grouped = new Map<number, UsageLog[]>()
  for (const log of errors) {
    const channelId = log.channel || 0
    const list = grouped.get(channelId) || []
    list.push(log)
    grouped.set(channelId, list)
  }
  return [...grouped.entries()]
    .map(([channelId, channelLogs]) => ({
      channelId,
      channelName:
        channelLogs[0]?.channel_name ||
        channelNameById.get(channelId) ||
        '未命名渠道',
      count: channelLogs.length,
      sample: contentSample(channelLogs),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

function buildTopModels(logs: UsageLog[]) {
  const grouped = new Map<string, { count: number; errors: number }>()
  for (const log of logs) {
    const model = log.model_name?.trim() || 'unknown'
    const item = grouped.get(model) || { count: 0, errors: 0 }
    item.count += 1
    if (log.type === LOG_TYPE_ERROR) item.errors += 1
    grouped.set(model, item)
  }
  return [...grouped.entries()]
    .map(([model, value]) => ({ model, ...value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

export async function collectHealthSnapshot(
  config: AppConfig,
  client = new NewApiClient(config.newApi)
): Promise<HealthSnapshot> {
  const end = Math.floor(Date.now() / 1000)
  const start = end - Math.max(1, config.newApi.logHours) * 60 * 60
  const [channelData, logData, stats] = await Promise.all([
    client.getChannels(),
    client.getRecentLogs(start, end),
    client.getLogStats(start, end),
  ])

  const channels = channelData.items
  const logs = logData.items
  const success = logs.filter((log) => log.type === LOG_TYPE_CONSUME).length
  const errors = logs.filter((log) => log.type === LOG_TYPE_ERROR).length
  const totalEffective = success + errors

  const statusCounts = countBy(channels, (channel) => String(channel.status))
  const lowBalance = channels
    .filter((channel) => {
      const balance = Number(channel.balance || 0)
      return balance > 0 && balance <= config.newApi.balanceWarningUsd
    })
    .sort((a, b) => Number(a.balance || 0) - Number(b.balance || 0))
    .slice(0, 10)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      balance: Number(channel.balance || 0),
      tag: channel.tag,
    }))

  const slowest = channels
    .filter((channel) => Number(channel.response_time || 0) > 0)
    .sort((a, b) => Number(b.response_time || 0) - Number(a.response_time || 0))
    .slice(0, 10)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      responseTimeMs: Number(channel.response_time || 0),
    }))

  return {
    generatedAt: new Date().toISOString(),
    window: {
      start: new Date(start * 1000).toISOString(),
      end: new Date(end * 1000).toISOString(),
      hours: config.newApi.logHours,
    },
    channels: {
      total: channels.length,
      enabled: statusCounts.get(String(CHANNEL_STATUS_ENABLED)) || 0,
      manuallyDisabled:
        statusCounts.get(String(CHANNEL_STATUS_MANUAL_DISABLED)) || 0,
      autoDisabled: statusCounts.get(String(CHANNEL_STATUS_AUTO_DISABLED)) || 0,
      lowBalance,
      slowest,
    },
    logs: {
      total: logData.total || logs.length,
      success,
      errors,
      failureRate: totalEffective === 0 ? 0 : errors / totalEffective,
      rpm: stats.rpm,
      tpm: stats.tpm,
      quota: stats.quota,
      topErrorChannels: buildTopErrorChannels(logs, channels),
      topModels: buildTopModels(logs),
    },
    policy: {
      minRequests: config.report.minRequests,
      failureRateThreshold: config.report.failureRateThreshold,
    },
  }
}
