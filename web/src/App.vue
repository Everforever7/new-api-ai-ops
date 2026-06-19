<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  AlertCircle,
  Layers3,
  PlayCircle,
  RefreshCw,
} from 'lucide-vue-next'
import { getChannels, getStatus, runCheck as requestRunCheck } from './api.js'

const tabs = [
  { id: 'dashboard', label: '仪表盘' },
  { id: 'report', label: '分析报告' },
  { id: 'channels', label: '渠道快照' },
]

const activeTab = ref('dashboard')
const status = ref(null)
const channels = ref([])
const uiError = ref('')
const refreshing = ref(false)
const runningCheck = ref(false)

const snapshot = computed(() => status.value?.lastSnapshot)
const reportText = computed(() => status.value?.lastReport || '暂无报告。')
const lastRunText = computed(() => `上次运行: ${formatDate(status.value?.lastRunAt)}`)
const latestError = computed(() => uiError.value || status.value?.lastError || '')
const visibleChannels = computed(() => channels.value.slice(0, 50))

const runState = computed(() => {
  if (latestError.value) {
    return { className: 'danger', label: '运行异常' }
  }

  if (status.value?.running || runningCheck.value) {
    return { className: 'warn', label: '正在检查' }
  }

  return { className: 'ok', label: '系统就绪' }
})

function formatDate(value) {
  if (!value) return '-'

  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatPercent(value) {
  if (typeof value !== 'number') return '-'
  return `${(value * 100).toFixed(1)}%`
}

function formatBalance(value) {
  if (typeof value !== 'number') return '-'
  return `$${value.toFixed(2)}`
}

function channelStatusClass(channel) {
  if (channel.status === 1) return 'ok'
  if (channel.status === 2) return 'warn'
  return 'danger'
}

async function refreshAll() {
  refreshing.value = true
  uiError.value = ''

  try {
    const [nextStatus, nextChannels] = await Promise.all([
      getStatus(),
      getChannels().catch(() => []),
    ])

    status.value = nextStatus
    channels.value = nextChannels
  } catch (error) {
    uiError.value = error instanceof Error ? error.message : String(error)
  } finally {
    refreshing.value = false
  }
}

async function runManualCheck() {
  runningCheck.value = true
  uiError.value = ''

  try {
    await requestRunCheck()
    await refreshAll()
  } catch (error) {
    uiError.value = error instanceof Error ? error.message : String(error)
  } finally {
    runningCheck.value = false
  }
}

onMounted(() => {
  refreshAll()
})
</script>

<template>
  <header class="app-header">
    <div class="shell topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <Layers3 :size="22" />
        </div>
        <h1>new-api AI 运维</h1>
        <span class="status" :class="runState.className">{{ runState.label }}</span>
      </div>

      <nav class="tabs" aria-label="面板视图">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab"
          :class="{ active: activeTab === tab.id }"
          type="button"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>
  </header>

  <main class="shell page">
    <section class="toolbar" aria-label="运行状态">
      <div class="toolbar-info">
        <div class="muted">{{ lastRunText }}</div>
        <div v-if="latestError" class="error-text">
          <AlertCircle :size="15" />
          <span>{{ latestError }}</span>
        </div>
      </div>

      <div class="toolbar-actions">
        <button class="button" type="button" :disabled="refreshing" @click="refreshAll">
          <RefreshCw :size="18" :class="{ spin: refreshing }" />
          <span>{{ refreshing ? '刷新中' : '刷新数据' }}</span>
        </button>
        <button
          class="button primary"
          type="button"
          :disabled="runningCheck"
          @click="runManualCheck"
        >
          <PlayCircle v-if="!runningCheck" :size="18" />
          <RefreshCw v-else :size="18" class="spin" />
          <span>{{ runningCheck ? '检查中' : '立即检查' }}</span>
        </button>
      </div>
    </section>

    <section v-show="activeTab === 'dashboard'" class="tab-content">
      <div class="grid">
        <article class="metric-card">
          <h2>渠道状态</h2>
          <div class="metric">{{ snapshot?.channels.total ?? '-' }}</div>
          <p class="muted">
            已启用 {{ snapshot?.channels.enabled ?? '-' }} / 自动禁用
            {{ snapshot?.channels.autoDisabled ?? '-' }}
          </p>
        </article>

        <article class="metric-card">
          <h2>近期日志</h2>
          <div class="metric">{{ snapshot?.logs.total ?? '-' }}</div>
          <p class="muted">
            成功 {{ snapshot?.logs.success ?? '-' }} / 错误 {{ snapshot?.logs.errors ?? '-' }}
          </p>
        </article>

        <article class="metric-card">
          <h2>失败率</h2>
          <div class="metric">{{ formatPercent(snapshot?.logs.failureRate) }}</div>
          <p class="muted">
            RPM {{ snapshot?.logs.rpm ?? '-' }} / TPM {{ snapshot?.logs.tpm ?? '-' }}
          </p>
        </article>

        <article class="metric-card">
          <h2>低余额提示</h2>
          <div class="metric">{{ snapshot?.channels.lowBalance.length ?? '-' }}</div>
          <p class="muted">
            <template v-if="snapshot?.channels.slowest[0]">
              最慢渠道 #{{ snapshot.channels.slowest[0].id }}
              ({{ snapshot.channels.slowest[0].responseTimeMs }}ms)
            </template>
            <template v-else>全部极速响应</template>
          </p>
        </article>
      </div>
    </section>

    <section v-show="activeTab === 'report'" class="tab-content">
      <article class="panel">
        <div class="panel-header">
          <h2>最新 AI 分析报告</h2>
        </div>
        <pre>{{ reportText }}</pre>
      </article>
    </section>

    <section v-show="activeTab === 'channels'" class="tab-content">
      <article class="panel">
        <div class="panel-header">
          <h2>渠道快照列表</h2>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>状态</th>
                <th>余额</th>
                <th>响应延迟</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!visibleChannels.length">
                <td colspan="5" class="empty">暂无数据</td>
              </tr>
              <tr v-for="channel in visibleChannels" :key="channel.id">
                <td class="channel-id">{{ channel.id }}</td>
                <td>{{ channel.name }}</td>
                <td>
                  <span class="status compact" :class="channelStatusClass(channel)">
                    {{ channel.statusLabel || '未知' }}
                  </span>
                </td>
                <td>{{ formatBalance(channel.balance) }}</td>
                <td>{{ channel.responseTimeMs ? `${channel.responseTimeMs} ms` : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </section>
  </main>
</template>
