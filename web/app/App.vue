<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  Layers3,
  LayoutDashboard,
  FileText,
  Radio,
  Settings2,
} from 'lucide-vue-next'
import {
  getChannels,
  getSettings,
  getStatus,
  runCheck as requestRunCheck,
  saveSettings as requestSaveSettings,
} from './api.js'
import { LANGUAGES, resolveLocale, translate } from './i18n.js'

// Import Sub-components
import FloatingDock from './components/FloatingDock.vue'
import BentoDashboard from './components/BentoDashboard.vue'
import ReportPanel from './components/ReportPanel.vue'
import ChannelsTable from './components/ChannelsTable.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ErrorToast from './components/ErrorToast.vue'

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
const settings = ref(null)
const errorToasts = ref([])
const refreshing = ref(false)
const runningCheck = ref(false)
const settingsLoading = ref(false)
const settingsSaving = ref(false)
const settingsSavedAt = ref('')

const tabs = computed(() => [
  { id: 'dashboard', label: t('tabs.dashboard'), icon: LayoutDashboard },
  { id: 'report', label: t('tabs.report'), icon: FileText },
  { id: 'channels', label: t('tabs.channels'), icon: Radio },
  { id: 'settings', label: t('tabs.settings'), icon: Settings2 },
])

const snapshot = computed(() => status.value?.lastSnapshot)
const reportText = computed(() => status.value?.lastReport || t('report.empty'))
const lastRunText = computed(() =>
  t('toolbar.lastRun', { value: formatDate(status.value?.lastRunAt) })
)
const latestError = computed(() => status.value?.lastError || '')
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
  } catch {}
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function notifyError(titleKey, error) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  errorToasts.value = [
    ...errorToasts.value.slice(-2),
    {
      id,
      title: t(titleKey),
      message: errorMessage(error),
    },
  ]

  window.setTimeout(() => dismissToast(id), 6500)
}

function dismissToast(id) {
  errorToasts.value = errorToasts.value.filter((toast) => toast.id !== id)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function updateSetting(path, value) {
  if (!settings.value) return

  const next = clone(settings.value)
  const parts = path.split('.')
  let target = next
  for (const part of parts.slice(0, -1)) {
    target = target[part]
  }
  target[parts.at(-1)] = value
  settings.value = next
  settingsSavedAt.value = ''
}

// FORMATTING HELPERS (passed as props)
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

// API ACTIONS
async function refreshAll() {
  refreshing.value = true
  try {
    const [statusResult, channelsResult] = await Promise.allSettled([
      getStatus(),
      getChannels(),
    ])

    if (statusResult.status === 'fulfilled') {
      status.value = statusResult.value
    } else {
      notifyError('errors.statusLoadFailed', statusResult.reason)
    }

    if (channelsResult.status === 'fulfilled') {
      channels.value = channelsResult.value
    } else {
      channels.value = []
      notifyError('errors.channelsLoadFailed', channelsResult.reason)
    }
  } finally {
    refreshing.value = false
  }
}

async function runManualCheck() {
  runningCheck.value = true
  try {
    await requestRunCheck()
    await refreshAll()
  } catch (error) {
    notifyError('errors.runFailed', error)
  } finally {
    runningCheck.value = false
  }
}

async function loadSettings() {
  settingsLoading.value = true
  try {
    settings.value = await getSettings()
  } catch (error) {
    notifyError('errors.settingsLoadFailed', error)
  } finally {
    settingsLoading.value = false
  }
}

async function saveSettings() {
  if (!settings.value) return

  settingsSaving.value = true
  try {
    settings.value = await requestSaveSettings(settings.value)
    settingsSavedAt.value = formatDate(new Date().toISOString())
  } catch (error) {
    notifyError('errors.settingsSaveFailed', error)
  } finally {
    settingsSaving.value = false
  }
}

onMounted(() => {
  refreshAll()
  loadSettings()
})
</script>

<template>
  <div class="bento-app">
    
    <header class="floating-brand">
      <div class="brand-mark"><Layers3 :size="24" /></div>
      <h1>{{ t('app.title') }}</h1>
    </header>

    <main class="bento-container">
      <Transition name="scale-fade" mode="out-in">
        
        <BentoDashboard 
          v-if="activeTab === 'dashboard'" 
          key="dashboard"
          :snapshot="snapshot"
          :currentTabName="currentTabName"
          :runState="runState"
          :lastRunText="lastRunText"
          :refreshing="refreshing"
          :runningCheck="runningCheck"
          :slowestChannelText="slowestChannelText"
          :t="t"
          :formatNumber="formatNumber"
          :formatPercent="formatPercent"
          @refreshAll="refreshAll"
          @runManualCheck="runManualCheck"
        />

        <ReportPanel 
          v-else-if="activeTab === 'report'" 
          key="report"
          :reportText="reportText"
          :t="t"
        />

        <ChannelsTable 
          v-else-if="activeTab === 'channels'" 
          key="channels"
          :visibleChannels="visibleChannels"
          :t="t"
          :formatBalance="formatBalance"
          :formatLatency="formatLatency"
        />

        <SettingsPanel
          v-else-if="activeTab === 'settings'"
          key="settings"
          :settings="settings"
          :loading="settingsLoading"
          :saving="settingsSaving"
          :savedAt="settingsSavedAt"
          :t="t"
          @updateSetting="updateSetting"
          @saveSettings="saveSettings"
          @reloadSettings="loadSettings"
        />

      </Transition>
    </main>

    <FloatingDock 
      :tabs="tabs"
      :activeTab="activeTab"
      :locale="locale"
      :theme="theme"
      :themeToggleLabel="themeToggleLabel"
      @update:activeTab="(id) => activeTab = id"
      @cycleLocale="cycleLocale"
      @toggleTheme="toggleTheme"
    />

    <ErrorToast
      :toasts="errorToasts"
      :t="t"
      @dismiss="dismissToast"
    />

  </div>
</template>
