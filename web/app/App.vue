<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  AlertCircle,
  Languages,
  Layers3,
  Moon,
  PlayCircle,
  RefreshCw,
  Sun,
} from 'lucide-vue-next'
import { getChannels, getStatus, runCheck as requestRunCheck } from './api.js'
import { LANGUAGES, resolveLocale, translate } from './i18n.js'

const STORAGE_KEYS = {
  locale: 'new-api-ai-ops:locale',
  theme: 'new-api-ai-ops:theme',
}

const themeOptions = ['light', 'dark']

const locale = ref(resolveLocale(readStoredValue(STORAGE_KEYS.locale)))
const theme = ref(resolveTheme(readStoredValue(STORAGE_KEYS.theme)))
const activeTab = ref('dashboard')
const status = ref(null)
const channels = ref([])
const uiError = ref('')
const refreshing = ref(false)
const runningCheck = ref(false)

const tabs = computed(() => [
  { id: 'dashboard', label: t('tabs.dashboard') },
  { id: 'report', label: t('tabs.report') },
  { id: 'channels', label: t('tabs.channels') },
])

const snapshot = computed(() => status.value?.lastSnapshot)
const reportText = computed(() => status.value?.lastReport || t('report.empty'))
const lastRunText = computed(() =>
  t('toolbar.lastRun', { value: formatDate(status.value?.lastRunAt) })
)
const latestError = computed(() => uiError.value || status.value?.lastError || '')
const visibleChannels = computed(() => channels.value.slice(0, 50))
const themeToggleLabel = computed(() =>
  theme.value === 'dark'
    ? t('preferences.switchToLight')
    : t('preferences.switchToDark')
)
const slowestChannelText = computed(() => {
  const channel = snapshot.value?.channels.slowest[0]
  if (!channel) return t('dashboard.allFast')

  return t('dashboard.slowestChannel', {
    id: channel.id,
    time: formatNumber(channel.responseTimeMs),
  })
})

const runState = computed(() => {
  if (latestError.value) {
    return { className: 'danger', label: t('status.error') }
  }

  if (status.value?.running || runningCheck.value) {
    return { className: 'warn', label: t('status.checking') }
  }

  return { className: 'ok', label: t('status.ready') }
})

watch(
  locale,
  (nextLocale) => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = nextLocale
      document.title = translate(nextLocale, 'document.title')
    }
    writeStoredValue(STORAGE_KEYS.locale, nextLocale)
  },
  { immediate: true }
)

watch(
  theme,
  (nextTheme) => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = nextTheme
      document.documentElement.style.colorScheme = nextTheme
    }
    writeStoredValue(STORAGE_KEYS.theme, nextTheme)
  },
  { immediate: true }
)

function t(key, params) {
  return translate(locale.value, key, params)
}

function readStoredValue(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStoredValue(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage can fail in private modes; the current session still works.
  }
}

function resolveTheme(value) {
  if (themeOptions.includes(value)) return value

  try {
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  } catch {
    // Fall back to light below.
  }

  return 'light'
}

function setLocale(nextLocale) {
  locale.value = resolveLocale(nextLocale)
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

function formatDate(value) {
  if (!value) return t('common.emptyValue')

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('common.emptyValue')

  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function formatNumber(value) {
  if (typeof value !== 'number') return t('common.emptyValue')

  return new Intl.NumberFormat(locale.value).format(value)
}

function formatPercent(value) {
  if (typeof value !== 'number') return t('common.emptyValue')

  return new Intl.NumberFormat(locale.value, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

function formatBalance(value) {
  if (typeof value !== 'number') return t('common.emptyValue')

  return new Intl.NumberFormat(locale.value, {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function formatLatency(value) {
  return typeof value === 'number' && value > 0
    ? `${formatNumber(value)} ms`
    : t('common.emptyValue')
}

function formatChannelStatus(channel) {
  if (channel.status === 1) return t('channelStatus.enabled')
  if (channel.status === 2) return t('channelStatus.autoDisabled')
  if (channel.status === 0) return t('channelStatus.disabled')

  return channel.statusLabel || t('channelStatus.unknown')
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
        <h1>{{ t('app.title') }}</h1>
        <span class="status" :class="runState.className">{{ runState.label }}</span>
      </div>

      <div class="header-controls">
        <nav class="tabs" :aria-label="t('tabs.label')">
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

        <div class="preferences">
          <div class="locale-switch" role="group" :aria-label="t('preferences.language')">
            <Languages class="locale-icon" :size="16" aria-hidden="true" />
            <button
              v-for="language in LANGUAGES"
              :key="language.id"
              class="locale-option"
              :class="{ active: locale === language.id }"
              type="button"
              :aria-pressed="locale === language.id"
              :title="language.label"
              @click="setLocale(language.id)"
            >
              {{ language.shortLabel }}
            </button>
          </div>

          <button
            class="icon-button"
            type="button"
            :aria-label="themeToggleLabel"
            :title="themeToggleLabel"
            @click="toggleTheme"
          >
            <Sun v-if="theme === 'dark'" :size="18" />
            <Moon v-else :size="18" />
          </button>
        </div>
      </div>
    </div>
  </header>

  <main class="shell page">
    <section class="toolbar" :aria-label="t('toolbar.statusLabel')">
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
          <span>{{ refreshing ? t('toolbar.refreshing') : t('toolbar.refresh') }}</span>
        </button>
        <button
          class="button primary"
          type="button"
          :disabled="runningCheck"
          @click="runManualCheck"
        >
          <PlayCircle v-if="!runningCheck" :size="18" />
          <RefreshCw v-else :size="18" class="spin" />
          <span>{{ runningCheck ? t('toolbar.checking') : t('toolbar.runNow') }}</span>
        </button>
      </div>
    </section>

    <section v-show="activeTab === 'dashboard'" class="tab-content">
      <div class="grid">
        <article class="metric-card">
          <h2>{{ t('dashboard.channelStatus') }}</h2>
          <div class="metric">{{ formatNumber(snapshot?.channels.total) }}</div>
          <p class="muted">
            {{
              t('dashboard.channelSummary', {
                enabled: formatNumber(snapshot?.channels.enabled),
                autoDisabled: formatNumber(snapshot?.channels.autoDisabled),
              })
            }}
          </p>
        </article>

        <article class="metric-card">
          <h2>{{ t('dashboard.recentLogs') }}</h2>
          <div class="metric">{{ formatNumber(snapshot?.logs.total) }}</div>
          <p class="muted">
            {{
              t('dashboard.logSummary', {
                success: formatNumber(snapshot?.logs.success),
                errors: formatNumber(snapshot?.logs.errors),
              })
            }}
          </p>
        </article>

        <article class="metric-card">
          <h2>{{ t('dashboard.failureRate') }}</h2>
          <div class="metric">{{ formatPercent(snapshot?.logs.failureRate) }}</div>
          <p class="muted">
            {{
              t('dashboard.throughput', {
                rpm: formatNumber(snapshot?.logs.rpm),
                tpm: formatNumber(snapshot?.logs.tpm),
              })
            }}
          </p>
        </article>

        <article class="metric-card">
          <h2>{{ t('dashboard.lowBalance') }}</h2>
          <div class="metric">{{ formatNumber(snapshot?.channels.lowBalance?.length) }}</div>
          <p class="muted">{{ slowestChannelText }}</p>
        </article>
      </div>
    </section>

    <section v-show="activeTab === 'report'" class="tab-content">
      <article class="panel">
        <div class="panel-header">
          <h2>{{ t('report.title') }}</h2>
        </div>
        <pre>{{ reportText }}</pre>
      </article>
    </section>

    <section v-show="activeTab === 'channels'" class="tab-content">
      <article class="panel">
        <div class="panel-header">
          <h2>{{ t('channels.title') }}</h2>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ t('channels.id') }}</th>
                <th>{{ t('channels.name') }}</th>
                <th>{{ t('channels.status') }}</th>
                <th>{{ t('channels.balance') }}</th>
                <th>{{ t('channels.latency') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!visibleChannels.length">
                <td colspan="5" class="empty">{{ t('channels.empty') }}</td>
              </tr>
              <tr v-for="channel in visibleChannels" :key="channel.id">
                <td class="channel-id">{{ channel.id }}</td>
                <td>{{ channel.name }}</td>
                <td>
                  <span class="status compact" :class="channelStatusClass(channel)">
                    {{ formatChannelStatus(channel) }}
                  </span>
                </td>
                <td>{{ formatBalance(channel.balance) }}</td>
                <td>{{ formatLatency(channel.responseTimeMs) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </section>
  </main>
</template>
