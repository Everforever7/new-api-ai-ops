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
  LayoutDashboard,
  FileText,
  Radio,
  ServerCrash,
  BatteryWarning,
  Activity
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
  { id: 'dashboard', label: t('tabs.dashboard'), icon: LayoutDashboard },
  { id: 'report', label: t('tabs.report'), icon: FileText },
  { id: 'channels', label: t('tabs.channels'), icon: Radio },
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

const currentTabName = computed(() => {
  return tabs.value.find(t => t.id === activeTab.value)?.label || ''
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
  }
}

function resolveTheme(value) {
  if (themeOptions.includes(value)) return value
  try {
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  } catch {}
  return 'light'
}

function setLocale(nextLocale) {
  locale.value = resolveLocale(nextLocale)
}

function cycleLocale() {
  const currentIndex = LANGUAGES.findIndex(l => l.id === locale.value);
  const nextIndex = (currentIndex + 1) % LANGUAGES.length;
  setLocale(LANGUAGES[nextIndex].id);
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

function formatDate(value) {
  if (!value) return t('common.emptyValue')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('common.emptyValue')

  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date)
}

function formatNumber(value) {
  if (typeof value !== 'number') return t('common.emptyValue')
  return new Intl.NumberFormat(locale.value).format(value)
}

function formatPercent(value) {
  if (typeof value !== 'number') return t('common.emptyValue')
  return new Intl.NumberFormat(locale.value, {
    style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(value)
}

function formatBalance(value) {
  if (typeof value !== 'number') return t('common.emptyValue')
  return new Intl.NumberFormat(locale.value, {
    style: 'currency', currency: 'USD',
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
      getStatus(), getChannels().catch(() => []),
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
  <div class="bento-app">
    
    <!-- Top Floating Logo (Optional but gives it a brand presence without a full header) -->
    <header class="floating-brand">
      <div class="brand-mark"><Layers3 :size="24" /></div>
      <h1>{{ t('app.title') }}</h1>
    </header>

    <main class="bento-container">
      <Transition name="scale-fade" mode="out-in">
        
        <!-- DASHBOARD BENTO GRID -->
        <div v-if="activeTab === 'dashboard'" class="bento-grid" key="dashboard">
          
          <!-- Hero Panel (Wide & Tall) -->
          <article class="bento-item bento-hero">
            <div class="hero-content">
              <h2>{{ currentTabName }}</h2>
              <div class="status-pill" :class="runState.className">
                <div class="status-dot"></div>
                {{ runState.label }}
              </div>
            </div>
            
            <div class="hero-actions">
              <div class="last-run">{{ lastRunText }}</div>
              <div v-if="latestError" class="error-text">
                <AlertCircle :size="14" />
                <span>{{ latestError }}</span>
              </div>
              <div class="buttons">
                <button class="bento-btn" type="button" :disabled="refreshing" @click="refreshAll" :title="t('toolbar.refresh')">
                  <RefreshCw :size="18" :class="{ spin: refreshing }" />
                </button>
                <button class="bento-btn primary" type="button" :disabled="runningCheck" @click="runManualCheck">
                  <PlayCircle v-if="!runningCheck" :size="18" />
                  <RefreshCw v-else :size="18" class="spin" />
                  <span>{{ runningCheck ? t('toolbar.checking') : t('toolbar.runNow') }}</span>
                </button>
              </div>
            </div>
          </article>

          <!-- Metric: Channels (Square) -->
          <article class="bento-item bento-square">
            <div class="bento-icon-wrapper"><ServerCrash :size="24"/></div>
            <div class="bento-data">
              <div class="bento-val">{{ formatNumber(snapshot?.channels.total) }}</div>
              <div class="bento-label">{{ t('dashboard.channelStatus') }}</div>
              <div class="bento-sub">{{ t('dashboard.channelSummary', { enabled: formatNumber(snapshot?.channels.enabled), autoDisabled: formatNumber(snapshot?.channels.autoDisabled) }) }}</div>
            </div>
          </article>

          <!-- Metric: Logs (Tall) -->
          <article class="bento-item bento-tall">
            <div class="bento-icon-wrapper"><FileText :size="24"/></div>
            <div class="bento-data">
              <div class="bento-val">{{ formatNumber(snapshot?.logs.total) }}</div>
              <div class="bento-label">{{ t('dashboard.recentLogs') }}</div>
              <div class="bento-sub">{{ t('dashboard.logSummary', { success: formatNumber(snapshot?.logs.success), errors: formatNumber(snapshot?.logs.errors) }) }}</div>
            </div>
          </article>

          <!-- Metric: Failure Rate (Square) -->
          <article class="bento-item bento-square">
            <div class="bento-icon-wrapper"><Activity :size="24"/></div>
            <div class="bento-data">
              <div class="bento-val">{{ formatPercent(snapshot?.logs.failureRate) }}</div>
              <div class="bento-label">{{ t('dashboard.failureRate') }}</div>
              <div class="bento-sub">{{ t('dashboard.throughput', { rpm: formatNumber(snapshot?.logs.rpm), tpm: formatNumber(snapshot?.logs.tpm) }) }}</div>
            </div>
          </article>

          <!-- Metric: Low Balance (Wide) -->
          <article class="bento-item bento-wide bento-highlight">
            <div class="bento-flex-row">
              <div class="bento-icon-wrapper warn"><BatteryWarning :size="28"/></div>
              <div class="bento-data flex-1">
                <div class="bento-label">{{ t('dashboard.lowBalance') }}</div>
                <div class="bento-val large">{{ formatNumber(snapshot?.channels.lowBalance?.length) }}</div>
                <div class="bento-sub">{{ slowestChannelText }}</div>
              </div>
            </div>
          </article>
          
        </div>

        <!-- REPORT BENTO -->
        <div v-else-if="activeTab === 'report'" class="bento-grid" key="report">
          <article class="bento-item bento-full report-bento">
             <div class="bento-header">
                <h3>{{ t('report.title') }}</h3>
             </div>
             <div class="bento-body">
               <pre class="minimal-pre">{{ reportText }}</pre>
             </div>
          </article>
        </div>

        <!-- CHANNELS BENTO -->
        <div v-else-if="activeTab === 'channels'" class="bento-grid" key="channels">
           <article class="bento-item bento-full table-bento">
              <div class="bento-header">
                <h3>{{ t('channels.title') }}</h3>
              </div>
              <div class="bento-body bento-table-wrap">
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
                        <span class="status-pill compact" :class="channelStatusClass(channel)">
                          <span class="status-dot"></span>
                          {{ formatChannelStatus(channel) }}
                        </span>
                      </td>
                      <td class="font-mono">{{ formatBalance(channel.balance) }}</td>
                      <td class="font-mono">{{ formatLatency(channel.responseTimeMs) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
           </article>
        </div>

      </Transition>
    </main>

    <!-- FLOATING DOCK -->
    <nav class="floating-dock">
      <div class="dock-container">
        <!-- Main Nav -->
        <div class="dock-group">
          <button 
            v-for="tab in tabs" 
            :key="tab.id"
            class="dock-item"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
            :title="tab.label"
          >
            <component :is="tab.icon" :size="22" />
            <span class="dock-tooltip">{{ tab.label }}</span>
            <div v-if="activeTab === tab.id" class="dock-indicator"></div>
          </button>
        </div>

        <div class="dock-divider"></div>

        <!-- Preferences -->
        <div class="dock-group">
           <button class="dock-item" @click="cycleLocale" title="Switch Language">
             <Languages :size="22" />
             <span class="dock-tooltip">{{ locale.toUpperCase() }}</span>
           </button>
           <button class="dock-item" @click="toggleTheme" :title="themeToggleLabel">
             <Sun v-if="theme === 'dark'" :size="22" />
             <Moon v-else :size="22" />
             <span class="dock-tooltip">{{ theme === 'dark' ? 'Light' : 'Dark' }}</span>
           </button>
        </div>
      </div>
    </nav>

  </div>
</template>
