<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Layers3,
  LayoutDashboard,
  FileText,
  MessageCircle,
  Radio,
  Settings2,
  Bot,
} from 'lucide-vue-next'
import {
  clearStoredAuth,
  executeAction as requestExecuteAction,
  fetchLlmModels as requestFetchLlmModels,
  getActionAudit,
  getAssistantSession,
  getChannelMemories,
  getChannelTestHistory as requestGetChannelTestHistory,
  getChannels,
  getActions,
  getSettings,
  getStoredAuth,
  rejectAction as requestRejectAction,
  getStatus,
  runCheck as requestRunCheck,
  runChannelTests as requestRunChannelTests,
  saveChannelMemory as requestSaveChannelMemory,
  saveSettings as requestSaveSettings,
  resetAssistantSession as requestResetAssistantSession,
  streamAssistantMessage as requestStreamAssistantMessage,
} from './api.js'
import { LANGUAGES, resolveLocale, translate } from './i18n.js'

// Import Sub-components
import LoginPanel from './components/LoginPanel.vue'
import FloatingDock from './components/FloatingDock.vue'
import AssistantPanel from './components/AssistantPanel.vue'
import BentoDashboard from './components/BentoDashboard.vue'
import ReportPanel from './components/ReportPanel.vue'
import ChannelsTable from './components/ChannelsTable.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ErrorToast from './components/ErrorToast.vue'
import ActionsPanel from './components/ActionsPanel.vue'

const STORAGE_KEYS = {
  locale: 'new-api-ai-ops:locale',
  theme: 'new-api-ai-ops:theme',
}

const themeOptions = ['light', 'dark']

const locale = ref(resolveLocale(readStoredValue(STORAGE_KEYS.locale)))
const theme = ref(resolveTheme(readStoredValue(STORAGE_KEYS.theme)))
const isLoggedIn = ref(false)
const activeTab = ref('dashboard')
const status = ref(null)
const channels = ref([])
const channelMemories = ref([])
const settings = ref(null)
const actions = ref([])
const actionAudit = ref([])
const errorToasts = ref([])
const refreshing = ref(false)
const runningCheck = ref(false)
const settingsLoading = ref(false)
const settingsSaving = ref(false)
const settingsSavedAt = ref('')
const actionsLoading = ref(false)
const executingActionIds = ref([])
const assistantSession = ref(null)
const assistantLoading = ref(false)
const assistantSending = ref(false)
const assistantResetting = ref(false)
const llmModels = ref([])
const llmModelsLoading = ref(false)
const llmModelsFetchedCount = ref(null)
const protectedSavingIds = ref([])
const testingChannelIds = ref([])
const testingAllChannels = ref(false)
const memorySavingIds = ref([])
const testHistoryChannel = ref(null)
const testHistoryRuns = ref([])
const testHistoryLoading = ref(false)

const tabs = computed(() => [
  { id: 'dashboard', label: t('tabs.dashboard'), icon: LayoutDashboard },
  { id: 'assistant', label: t('tabs.assistant'), icon: MessageCircle },
  { id: 'report', label: t('tabs.report'), icon: FileText },
  { id: 'channels', label: t('tabs.channels'), icon: Radio },
  { id: 'actions', label: t('tabs.actions'), icon: Bot },
  { id: 'settings', label: t('tabs.settings'), icon: Settings2 },
])

const snapshot = computed(() => status.value?.lastSnapshot)
const reportText = computed(() => status.value?.lastReport || t('report.empty'))
const lastRunText = computed(() =>
  t('toolbar.lastRun', { value: formatDate(status.value?.lastRunAt) })
)
const latestError = computed(() => status.value?.lastError || '')
const themeToggleLabel = computed(() =>
  theme.value === 'dark'
    ? t('preferences.switchToLight')
    : t('preferences.switchToDark')
)

const slowestChannelText = computed(() => {
  const channel = snapshot.value?.channels.slowest[0]
  if (!channel) return t('dashboard.allFast')

  return t('dashboard.slowestChannel', {
    name: channel.name || t('channels.unnamed'),
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

const channelMemoryById = computed(() => {
  return Object.fromEntries(
    channelMemories.value.map((memory) => [String(memory.channelId), memory])
  )
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

watch(activeTab, (nextTab) => {
  if (nextTab === 'assistant') {
    loadAssistantSession()
  }
  if (nextTab === 'actions') {
    loadActions()
  }
  if (nextTab === 'channels') {
    loadChannelMemories()
  }
})

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

function createClientMessageId(role) {
  return `assistant-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function redactAssistantPreview(input) {
  return input
    .slice(0, 6000)
    .replace(
      /(authorization\s*(?:[:：=]\s*)?)(Bearer\s+[A-Za-z0-9._~+/=-]+)/gi,
      '$1[AUTHORIZATION]'
    )
    .replace(/(cookie\s*[:：=]\s*)([^\n]+)/gi, '$1[COOKIE]')
    .replace(
      /((?:api[_\s-]?key|密钥|key)\s*[:：=]\s*)([^\s,，;；]+)/gi,
      '$1[API_KEY]'
    )
    .replace(
      /((?:api[_\s-]?key|密钥|key)\s+)([A-Za-z0-9._~+/=-]{8,})/gi,
      '$1[API_KEY]'
    )
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9._-]{12,}\b/g, '[API_KEY]')
}

function assistantSessionBase() {
  return assistantSession.value || {
    messages: [],
    lastActions: [],
    updatedAt: undefined,
  }
}

function appendOptimisticAssistantTurn(message, userMessageId, assistantMessageId) {
  const session = assistantSessionBase()
  const createdAt = new Date().toISOString()
  const messages = [
    ...(session.messages || []),
    {
      id: userMessageId,
      role: 'user',
      content: redactAssistantPreview(message),
      createdAt,
    },
    {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt,
    },
  ].slice(-80)

  assistantSession.value = {
    ...session,
    messages,
    lastActions: [],
    updatedAt: createdAt,
  }
}

function upsertAssistantMessage(message) {
  if (!message?.id) return

  const session = assistantSessionBase()
  const messages = [...(session.messages || [])]
  const index = messages.findIndex((item) => item.id === message.id)

  if (index >= 0) {
    messages[index] = { ...messages[index], ...message }
  } else {
    messages.push(message)
  }

  assistantSession.value = {
    ...session,
    messages: messages.slice(-80),
    updatedAt: new Date().toISOString(),
  }
}

function appendAssistantDelta(id, delta) {
  if (!id || !delta) return

  const session = assistantSessionBase()
  const messages = [...(session.messages || [])]
  const index = messages.findIndex((item) => item.id === id)
  if (index < 0) return

  messages[index] = {
    ...messages[index],
    content: `${messages[index].content || ''}${delta}`,
  }
  assistantSession.value = {
    ...session,
    messages,
    updatedAt: new Date().toISOString(),
  }
}

function markAssistantMessageFailed(id) {
  const session = assistantSessionBase()
  const messages = [...(session.messages || [])]
  const index = messages.findIndex((item) => item.id === id)
  if (index < 0) return

  const current = messages[index].content || ''
  const failed = t('assistant.sendFailedInline')
  messages[index] = {
    ...messages[index],
    content: current ? `${current}\n\n${failed}` : failed,
  }
  assistantSession.value = {
    ...session,
    messages,
    updatedAt: new Date().toISOString(),
  }
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
async function refreshAll(options = {}) {
  const { initialStatus = null } = options
  refreshing.value = true
  try {
    const statusRequest = initialStatus ? Promise.resolve(initialStatus) : getStatus()
    const [statusResult, channelsResult, memoriesResult] = await Promise.allSettled([
      statusRequest,
      getChannels(),
      getChannelMemories(),
    ])

    if (statusResult.status === 'fulfilled') {
      status.value = statusResult.value
      if (Array.isArray(statusResult.value.lastActions)) {
        actions.value = statusResult.value.lastActions
      }
    } else {
      notifyError('errors.statusLoadFailed', statusResult.reason)
    }

    if (channelsResult.status === 'fulfilled') {
      channels.value = channelsResult.value
    } else {
      channels.value = []
      notifyError('errors.channelsLoadFailed', channelsResult.reason)
    }

    if (memoriesResult.status === 'fulfilled') {
      channelMemories.value = Array.isArray(memoriesResult.value)
        ? memoriesResult.value
        : []
    } else {
      channelMemories.value = []
      notifyError('errors.channelMemoryLoadFailed', memoriesResult.reason)
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
    await loadActions()
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

async function loadActions() {
  actionsLoading.value = true
  try {
    const [queue, audit] = await Promise.all([
      getActions(),
      getActionAudit({ limit: 100 }),
    ])
    actions.value = queue
    actionAudit.value = audit
  } catch (error) {
    notifyError('errors.actionsLoadFailed', error)
  } finally {
    actionsLoading.value = false
  }
}

async function refreshActionAudit() {
  try {
    actionAudit.value = await getActionAudit({ limit: 100 })
  } catch {
    // Keep the current queue interaction quiet if the audit refresh races the backend.
  }
}

async function loadChannelMemories() {
  try {
    const result = await getChannelMemories()
    channelMemories.value = Array.isArray(result) ? result : []
  } catch (error) {
    notifyError('errors.channelMemoryLoadFailed', error)
  }
}

async function loadAssistantSession() {
  assistantLoading.value = true
  try {
    assistantSession.value = await getAssistantSession()
  } catch (error) {
    notifyError('errors.assistantLoadFailed', error)
  } finally {
    assistantLoading.value = false
  }
}

async function sendAssistantMessage(message) {
  assistantSending.value = true
  const userMessageId = createClientMessageId('user')
  const assistantMessageId = createClientMessageId('assistant')
  appendOptimisticAssistantTurn(message, userMessageId, assistantMessageId)

  try {
    const result = await requestStreamAssistantMessage(
      message,
      { userMessageId, assistantMessageId },
      {
        onMessage: (item) => upsertAssistantMessage(item),
        onDelta: (event) => appendAssistantDelta(event.id, event.delta),
        onDone: (event) => {
          if (event.session) {
            assistantSession.value = event.session
          }
        },
      }
    )

    if (result?.session) {
      assistantSession.value = result.session
    }
    await loadActions()
  } catch (error) {
    markAssistantMessageFailed(assistantMessageId)
    notifyError('errors.assistantSendFailed', error)
  } finally {
    assistantSending.value = false
  }
}

async function resetAssistantSession() {
  assistantResetting.value = true
  try {
    assistantSession.value = await requestResetAssistantSession()
  } catch (error) {
    notifyError('errors.assistantResetFailed', error)
  } finally {
    assistantResetting.value = false
  }
}

async function fetchLlmModels() {
  if (!settings.value?.llm) return

  llmModelsLoading.value = true
  llmModelsFetchedCount.value = null
  try {
    const result = await requestFetchLlmModels(settings.value.llm)
    llmModels.value = Array.isArray(result.models) ? result.models : []
    llmModelsFetchedCount.value =
      typeof result.count === 'number' ? result.count : llmModels.value.length
  } catch (error) {
    notifyError('errors.llmModelsLoadFailed', error)
  } finally {
    llmModelsLoading.value = false
  }
}

async function toggleProtectedChannel(channelId) {
  if (!settings.value) return

  const id = Number(channelId)
  if (!Number.isInteger(id)) return

  protectedSavingIds.value = [...new Set([...protectedSavingIds.value, id])]
  try {
    const next = clone(settings.value)
    const protectedChannels = next.aiExecution.protectedChannels
    const ids = new Set(
      Array.isArray(protectedChannels.ids)
        ? protectedChannels.ids.map(Number).filter(Number.isInteger)
        : []
    )

    if (ids.has(id)) {
      ids.delete(id)
    } else {
      ids.add(id)
    }

    protectedChannels.ids = [...ids].sort((a, b) => a - b)
    settings.value = await requestSaveSettings(next)
    settingsSavedAt.value = formatDate(new Date().toISOString())
  } catch (error) {
    notifyError('errors.protectedChannelSaveFailed', error)
  } finally {
    protectedSavingIds.value = protectedSavingIds.value.filter((item) => item !== id)
  }
}

async function refreshAfterChannelTests() {
  await Promise.allSettled([
    loadChannelMemories(),
    loadActions(),
  ])
}

async function testChannel(channelId) {
  const id = Number(channelId)
  if (!Number.isInteger(id)) return

  testingChannelIds.value = [...new Set([...testingChannelIds.value, id])]
  try {
    await requestRunChannelTests({ channelIds: [id] })
    await refreshAfterChannelTests()
  } catch (error) {
    notifyError('errors.channelTestRunFailed', error)
  } finally {
    testingChannelIds.value = testingChannelIds.value.filter((item) => item !== id)
  }
}

async function testEnabledChannels() {
  testingAllChannels.value = true
  try {
    await requestRunChannelTests({})
    await refreshAfterChannelTests()
  } catch (error) {
    notifyError('errors.channelTestRunFailed', error)
  } finally {
    testingAllChannels.value = false
  }
}

async function saveChannelNote(payload) {
  const id = Number(payload?.channelId)
  if (!Number.isInteger(id)) return

  memorySavingIds.value = [...new Set([...memorySavingIds.value, id])]
  try {
    const memory = await requestSaveChannelMemory(id, {
      manualNote: payload.manualNote || '',
    })
    const others = channelMemories.value.filter((item) => item.channelId !== id)
    channelMemories.value = [...others, memory].sort((a, b) => a.channelId - b.channelId)
  } catch (error) {
    notifyError('errors.channelMemorySaveFailed', error)
  } finally {
    memorySavingIds.value = memorySavingIds.value.filter((item) => item !== id)
  }
}

async function openChannelTestHistory(channel) {
  testHistoryChannel.value = channel
  testHistoryRuns.value = []
  testHistoryLoading.value = true
  try {
    testHistoryRuns.value = await requestGetChannelTestHistory({
      channelId: channel.id,
      limit: 50,
    })
  } catch (error) {
    notifyError('errors.channelTestHistoryLoadFailed', error)
  } finally {
    testHistoryLoading.value = false
  }
}

function closeChannelTestHistory() {
  testHistoryChannel.value = null
  testHistoryRuns.value = []
  testHistoryLoading.value = false
}

async function executeAction(actionId) {
  executingActionIds.value = [...new Set([...executingActionIds.value, actionId])]
  try {
    const updated = await requestExecuteAction(actionId)
    actions.value = actions.value.map((action) =>
      action.id === updated.id ? updated : action
    )
    await refreshActionAudit()
  } catch (error) {
    notifyError('errors.actionExecuteFailed', error)
  } finally {
    executingActionIds.value = executingActionIds.value.filter((id) => id !== actionId)
  }
}

async function rejectAction(actionId) {
  executingActionIds.value = [...new Set([...executingActionIds.value, actionId])]
  try {
    const updated = await requestRejectAction(actionId)
    actions.value = actions.value.map((action) =>
      action.id === updated.id ? updated : action
    )
    await refreshActionAudit()
  } catch (error) {
    notifyError('errors.actionRejectFailed', error)
  } finally {
    executingActionIds.value = executingActionIds.value.filter((id) => id !== actionId)
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

async function checkAuth() {
  if (!getStoredAuth()) {
    isLoggedIn.value = false
    return
  }
  try {
    const authenticatedStatus = await getStatus()
    isLoggedIn.value = true
    loadInitialData(authenticatedStatus)
  } catch (error) {
    // 401 will trigger the auth:unauthorized event
  }
}

function loadInitialData(initialStatus = null) {
  refreshAll({ initialStatus })
  loadSettings()
  loadActions()
}

function resetAuthenticatedState() {
  status.value = null
  channels.value = []
  channelMemories.value = []
  settings.value = null
  actions.value = []
  errorToasts.value = []
  settingsSavedAt.value = ''
  refreshing.value = false
  runningCheck.value = false
  settingsLoading.value = false
  settingsSaving.value = false
  actionsLoading.value = false
  executingActionIds.value = []
  assistantSession.value = null
  assistantLoading.value = false
  assistantSending.value = false
  assistantResetting.value = false
  llmModels.value = []
  llmModelsLoading.value = false
  llmModelsFetchedCount.value = null
  protectedSavingIds.value = []
  testingChannelIds.value = []
  testingAllChannels.value = false
  memorySavingIds.value = []
  testHistoryChannel.value = null
  testHistoryRuns.value = []
  testHistoryLoading.value = false
}

function handleUnauthorized() {
  clearStoredAuth()
  isLoggedIn.value = false
  resetAuthenticatedState()
}

function onLoginSuccess(authenticatedStatus) {
  isLoggedIn.value = true
  loadInitialData(authenticatedStatus)
}

onMounted(() => {
  window.addEventListener('auth:unauthorized', handleUnauthorized)
  checkAuth()
})

onBeforeUnmount(() => {
  window.removeEventListener('auth:unauthorized', handleUnauthorized)
})
</script>

<template>
  <LoginPanel v-if="!isLoggedIn" @loginSuccess="onLoginSuccess" :t="t" />

  <div class="bento-app" v-else>
    <div class="background-mesh"></div>
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

        <AssistantPanel
          v-else-if="activeTab === 'assistant'"
          key="assistant"
          :session="assistantSession"
          :loading="assistantLoading"
          :sending="assistantSending"
          :resetting="assistantResetting"
          :t="t"
          @sendMessage="sendAssistantMessage"
          @resetSession="resetAssistantSession"
          @openActions="activeTab = 'actions'"
        />

        <ReportPanel 
          v-else-if="activeTab === 'report'" 
          key="report"
          :t="t"
          :formatDate="formatDate"
        />

        <ChannelsTable 
          v-else-if="activeTab === 'channels'" 
          key="channels"
          :channels="channels"
          :channelMemories="channelMemoryById"
          :settings="settings"
          :protectedSavingIds="protectedSavingIds"
          :testingChannelIds="testingChannelIds"
          :testingAllChannels="testingAllChannels"
          :memorySavingIds="memorySavingIds"
          :testHistoryChannel="testHistoryChannel"
          :testHistoryRuns="testHistoryRuns"
          :testHistoryLoading="testHistoryLoading"
          :t="t"
          :formatBalance="formatBalance"
          :formatLatency="formatLatency"
          :formatDate="formatDate"
          :formatPercent="formatPercent"
          @toggleProtectedChannel="toggleProtectedChannel"
          @testChannel="testChannel"
          @testEnabledChannels="testEnabledChannels"
          @saveChannelNote="saveChannelNote"
          @openTestHistory="openChannelTestHistory"
          @closeTestHistory="closeChannelTestHistory"
        />

        <ActionsPanel
          v-else-if="activeTab === 'actions'"
          key="actions"
          :actions="actions"
          :auditActions="actionAudit"
          :loading="actionsLoading"
          :executingActionIds="executingActionIds"
          :formatDate="formatDate"
          :t="t"
          @executeAction="executeAction"
          @rejectAction="rejectAction"
          @refreshActions="loadActions"
        />

        <SettingsPanel
          v-else-if="activeTab === 'settings'"
          key="settings"
          :settings="settings"
          :loading="settingsLoading"
          :saving="settingsSaving"
          :savedAt="settingsSavedAt"
          :llmModels="llmModels"
          :llmModelsLoading="llmModelsLoading"
          :llmModelsFetchedCount="llmModelsFetchedCount"
          :t="t"
          @updateSetting="updateSetting"
          @saveSettings="saveSettings"
          @reloadSettings="loadSettings"
          @fetchLlmModels="fetchLlmModels"
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
