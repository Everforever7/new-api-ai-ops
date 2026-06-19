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
const uiError = ref('')
const settingsError = ref('')
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

async function loadSettings() {
  settingsLoading.value = true
  settingsError.value = ''
  try {
    settings.value = await getSettings()
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : String(error)
  } finally {
    settingsLoading.value = false
  }
}

async function saveSettings() {
  if (!settings.value) return

  settingsSaving.value = true
  settingsError.value = ''
  try {
    settings.value = await requestSaveSettings(settings.value)
    settingsSavedAt.value = formatDate(new Date().toISOString())
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : String(error)
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
          :latestError="latestError"
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
          :error="settingsError"
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

  </div>
</template>
