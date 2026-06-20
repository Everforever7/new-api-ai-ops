<script setup>
import { computed, ref } from 'vue'
import {
  Activity,
  BarChart3,
  Brain,
  Check,
  Database,
  Edit3,
  FlaskConical,
  Gauge,
  KeyRound,
  ListChecks,
  Lock,
  PlusCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  WalletCards,
  LogOut,
  X,
} from 'lucide-vue-next'

import { clearStoredAuth } from '../api.js'
import CustomSelect from './CustomSelect.vue'

const props = defineProps({
  settings: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  savedAt: { type: String, default: '' },
  llmModels: { type: Array, default: () => [] },
  llmModelsLoading: { type: Boolean, default: false },
  t: { type: Function, required: true },
})

const emit = defineEmits([
  'updateSetting',
  'saveSettings',
  'reloadSettings',
  'fetchLlmModels',
])
const activeSettingsTab = ref('execution')
const promptEditorType = ref('')
const promptEditorDraft = ref('')

const permissionRows = computed(() => [
  {
    key: 'testChannel',
    icon: Activity,
    title: props.t('settings.permissions.testChannel'),
  },
  {
    key: 'createChannel',
    icon: PlusCircle,
    title: props.t('settings.permissions.createChannel'),
  },
  {
    key: 'updateChannel',
    icon: Edit3,
    title: props.t('settings.permissions.updateChannel'),
  },
  {
    key: 'disableChannel',
    icon: Lock,
    title: props.t('settings.permissions.disableChannel'),
  },
  {
    key: 'deleteChannel',
    icon: Trash2,
    title: props.t('settings.permissions.deleteChannel'),
  },
])

const promptRows = computed(() => [
  {
    key: 'includeChannelSummary',
    icon: ListChecks,
    title: props.t('settings.prompt.parts.channelSummary'),
    hint: props.t('settings.prompt.hints.channelSummary'),
  },
  {
    key: 'includeErrors',
    icon: Activity,
    title: props.t('settings.prompt.parts.errors'),
    hint: props.t('settings.prompt.hints.errors'),
  },
  {
    key: 'includeModels',
    icon: BarChart3,
    title: props.t('settings.prompt.parts.models'),
    hint: props.t('settings.prompt.hints.models'),
  },
  {
    key: 'includeLatency',
    icon: Gauge,
    title: props.t('settings.prompt.parts.latency'),
    hint: props.t('settings.prompt.hints.latency'),
  },
  {
    key: 'includeBalance',
    icon: WalletCards,
    title: props.t('settings.prompt.parts.balance'),
    hint: props.t('settings.prompt.hints.balance'),
  },
])

const confirmationOptions = computed(() => [
  { value: 'auto', label: props.t('settings.confirmation.auto') },
  { value: 'confirm', label: props.t('settings.confirmation.confirm') },
  { value: 'never', label: props.t('settings.confirmation.never') },
])

const llmModelOptions = computed(() => {
  const current = props.settings?.llm?.model
  return [
    ...new Set([
      ...(current ? [current] : []),
      ...props.llmModels.map(String),
    ]),
  ].filter(Boolean)
})

const settingsTabs = computed(() => [
  {
    id: 'execution',
    icon: ShieldCheck,
    label: props.t('settings.execution.title'),
  },
  {
    id: 'prompt',
    icon: Brain,
    label: props.t('settings.prompt.title'),
  },
  {
    id: 'activeTesting',
    icon: FlaskConical,
    label: props.t('settings.activeTesting.title'),
  },
  {
    id: 'storage',
    icon: Database,
    label: props.t('settings.storage.title'),
  },
  {
    id: 'llm',
    icon: KeyRound,
    label: props.t('settings.llm.title'),
  },
])

const promptEditorConfig = computed(() => {
  if (promptEditorType.value === 'report') {
    return {
      path: 'prompt.customInstructions',
      title: props.t('settings.prompt.customInstructions'),
      hint: props.t('settings.prompt.reportHint'),
      placeholder: props.t('settings.prompt.customPlaceholder'),
    }
  }

  if (promptEditorType.value === 'assistant') {
    return {
      path: 'prompt.assistantInstructions',
      title: props.t('settings.prompt.assistantInstructions'),
      hint: props.t('settings.prompt.assistantHint'),
      placeholder: props.t('settings.prompt.assistantPlaceholder'),
    }
  }

  return null
})

function settingValue(path) {
  return path.split('.').reduce((value, key) => value?.[key], props.settings)
}

function update(path, value) {
  emit('updateSetting', path, value)
}

function openPromptEditor(type) {
  promptEditorType.value = type
  const config = promptEditorConfig.value
  promptEditorDraft.value = config ? String(settingValue(config.path) || '') : ''
}

function closePromptEditor() {
  promptEditorType.value = ''
  promptEditorDraft.value = ''
}

function applyPromptEditor() {
  const config = promptEditorConfig.value
  if (!config) return
  update(config.path, promptEditorDraft.value)
  closePromptEditor()
}

function updateApiKey(value) {
  update('llm.apiKey', value)
  if (value) update('llm.clearApiKey', false)
}

function toggleClearApiKey() {
  const next = !settingValue('llm.clearApiKey')
  update('llm.clearApiKey', next)
  if (next) update('llm.apiKey', '')
}

function logout() {
  clearStoredAuth()
  window.dispatchEvent(new Event('auth:unauthorized'))
}
</script>

<template>
  <div class="bento-grid settings-grid">
    <article v-if="loading" class="bento-item bento-full">
      <div class="bento-header">
        <h3>{{ t('settings.loading') }}</h3>
      </div>
    </article>

    <template v-else-if="settings">
      <article class="bento-item bento-hero settings-hero">
        <div class="hero-content">
          <h2>{{ t('settings.title') }}</h2>
          <div
            class="status-pill"
            :class="settings.aiExecution.enabled ? 'ok' : 'warn'"
          >
            <div class="status-dot"></div>
            {{
              settings.aiExecution.enabled
                ? t('settings.aiEnabled')
                : t('settings.aiDisabled')
            }}
          </div>
        </div>

        <div class="hero-actions">
          <div v-if="savedAt" class="last-run">
            {{ t('settings.savedAt', { value: savedAt }) }}
          </div>
          <div class="buttons">
            <button
              class="bento-btn"
              type="button"
              :disabled="saving"
              @click="emit('reloadSettings')"
            >
              <RefreshCw :size="18" />
            </button>
            <button
              class="bento-btn danger compact"
              @click="logout"
            >
              <LogOut :size="18" />
              <span>{{ t('login.logout') || '退出登录' }}</span>
            </button>
            <button
              class="bento-btn primary"
              type="button"
              :disabled="saving"
              @click="emit('saveSettings')"
            >
              <Save :size="18" />
              <span>{{ saving ? t('settings.saving') : t('settings.save') }}</span>
            </button>
          </div>
        </div>
      </article>

      <article class="bento-item bento-full adaptive-bento settings-panel high-density">
        <div class="bento-header settings-panel-header">
          <div class="bento-icon-wrapper">
            <ShieldCheck :size="24" />
          </div>
          <h3>{{ t('settings.execution.title') }}</h3>
        </div>

        <div
          class="settings-subtabs"
          role="tablist"
          :aria-label="t('settings.title')"
        >
          <button
            v-for="tab in settingsTabs"
            :key="tab.id"
            class="settings-subtab"
            :class="{ active: activeSettingsTab === tab.id }"
            type="button"
            role="tab"
            :aria-selected="activeSettingsTab === tab.id"
            @click="activeSettingsTab = tab.id"
          >
            <component :is="tab.icon" :size="16" />
            <span>{{ tab.label }}</span>
          </button>
        </div>

        <div class="bento-body settings-tab-panel">
          <div
            v-if="activeSettingsTab === 'execution'"
            class="settings-stack"
            role="tabpanel"
          >
            <div class="settings-control-row">
              <div class="settings-inline-main">
                <div class="bento-label">{{ t('settings.globalSwitch') }}</div>
                <div class="bento-sub">{{ t('settings.globalState') }}</div>
              </div>
              <button
                class="setting-switch"
                :class="{ active: settings.aiExecution.enabled }"
                type="button"
                :aria-pressed="settings.aiExecution.enabled"
                @click="update('aiExecution.enabled', !settings.aiExecution.enabled)"
              >
                {{
                  settings.aiExecution.enabled
                    ? t('settings.on')
                    : t('settings.off')
                }}
              </button>
            </div>

            <div class="settings-section">
              <div class="settings-section-title">
                <SlidersHorizontal :size="18" />
                <span>{{ t('settings.safety.title') }}</span>
              </div>
              <div class="settings-number-grid">
                <label class="settings-field">
                  <span>{{ t('settings.safety.minRequests') }}</span>
                  <input
                    type="number"
                    min="0"
                    :value="settings.aiExecution.safety.minRequestsForActions"
                    @input="
                      update(
                        'aiExecution.safety.minRequestsForActions',
                        Number($event.target.value)
                      )
                    "
                  />
                </label>
                <label class="settings-field">
                  <span>{{ t('settings.safety.maxActions') }}</span>
                  <input
                    type="number"
                    min="0"
                    :value="settings.aiExecution.safety.maxActionsPerRun"
                    @input="
                      update(
                        'aiExecution.safety.maxActionsPerRun',
                        Number($event.target.value)
                      )
                    "
                  />
                </label>
                <label class="settings-field">
                  <span>{{ t('settings.safety.cooldown') }}</span>
                  <input
                    type="number"
                    min="0"
                    :value="settings.aiExecution.safety.channelCooldownMinutes"
                    @input="
                      update(
                        'aiExecution.safety.channelCooldownMinutes',
                        Number($event.target.value)
                      )
                    "
                  />
                </label>
              </div>
            </div>

            <div class="settings-section">
              <div class="settings-section-title">
                <Activity :size="18" />
                <span>{{ t('settings.permissions.title') }}</span>
              </div>
              <div class="bento-table-wrap">
                <table class="settings-table">
                  <thead>
                    <tr>
                      <th>{{ t('settings.permissions.action') }}</th>
                      <th>{{ t('settings.permissions.allowed') }}</th>
                      <th>{{ t('settings.permissions.strategy') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in permissionRows" :key="row.key">
                      <td>
                        <div class="permission-name">
                          <component :is="row.icon" :size="18" />
                          <span>{{ row.title }}</span>
                        </div>
                      </td>
                      <td>
                        <button
                          class="setting-switch small"
                          :class="{ active: settingValue(`aiExecution.permissions.${row.key}`) }"
                          type="button"
                          :aria-pressed="settingValue(`aiExecution.permissions.${row.key}`)"
                          @click="
                            update(
                              `aiExecution.permissions.${row.key}`,
                              !settingValue(`aiExecution.permissions.${row.key}`)
                            )
                          "
                        >
                          {{
                            settingValue(`aiExecution.permissions.${row.key}`)
                              ? t('settings.on')
                              : t('settings.off')
                          }}
                        </button>
                      </td>
                      <td>
                        <CustomSelect
                          :modelValue="settingValue(`aiExecution.confirmation.${row.key}`)"
                          :options="confirmationOptions"
                          @change="
                            update(
                              `aiExecution.confirmation.${row.key}`,
                              $event
                            )
                          "
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div
            v-else-if="activeSettingsTab === 'prompt'"
            class="settings-stack"
            role="tabpanel"
          >
            <div class="bento-table-wrap">
              <table class="settings-table">
                <thead>
                  <tr>
                    <th>{{ t('settings.prompt.part') }}</th>
                    <th>{{ t('settings.prompt.include') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in promptRows" :key="row.key">
                    <td>
                      <div class="permission-name prompt-name">
                        <component :is="row.icon" :size="18" />
                        <span>
                          <strong>{{ row.title }}</strong>
                          <small>{{ row.hint }}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <button
                        class="setting-switch small"
                        :class="{ active: settingValue(`prompt.${row.key}`) }"
                        type="button"
                        :aria-pressed="settingValue(`prompt.${row.key}`)"
                        @click="
                          update(
                            `prompt.${row.key}`,
                            !settingValue(`prompt.${row.key}`)
                          )
                        "
                      >
                        {{
                          settingValue(`prompt.${row.key}`)
                            ? t('settings.on')
                            : t('settings.off')
                        }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="prompt-editor-launches">
              <button
                class="prompt-editor-button"
                type="button"
                @click="openPromptEditor('report')"
              >
                <Edit3 :size="18" />
                <span>{{ t('settings.prompt.editReportPrompt') }}</span>
              </button>

              <button
                class="prompt-editor-button"
                type="button"
                @click="openPromptEditor('assistant')"
              >
                <Brain :size="18" />
                <span>{{ t('settings.prompt.editAssistantPrompt') }}</span>
              </button>

              <div class="settings-core-note">
                <Lock :size="16" />
                <span>{{ t('settings.prompt.coreSafetyHint') }}</span>
              </div>
            </div>
          </div>

          <div
            v-else-if="activeSettingsTab === 'activeTesting'"
            class="settings-stack"
            role="tabpanel"
          >
            <div class="settings-control-row">
              <div class="settings-inline-main">
                <div class="bento-label">{{ t('settings.activeTesting.enabled') }}</div>
                <div class="bento-sub">{{ t('settings.activeTesting.enabledHint') }}</div>
              </div>
              <button
                class="setting-switch"
                :class="{ active: settingValue('activeTesting.enabled') }"
                type="button"
                :aria-pressed="settingValue('activeTesting.enabled')"
                @click="update('activeTesting.enabled', !settingValue('activeTesting.enabled'))"
              >
                {{
                  settingValue('activeTesting.enabled')
                    ? t('settings.on')
                    : t('settings.off')
                }}
              </button>
            </div>

            <div class="settings-section">
              <div class="settings-section-title">
                <FlaskConical :size="18" />
                <span>{{ t('settings.activeTesting.policyTitle') }}</span>
              </div>
              <div class="settings-number-grid active-testing-grid">
                <label class="settings-field">
                  <span>{{ t('settings.activeTesting.intervalMinutes') }}</span>
                  <input
                    type="number"
                    min="1"
                    :value="settingValue('activeTesting.intervalMinutes')"
                    @input="update('activeTesting.intervalMinutes', Number($event.target.value))"
                  />
                </label>
                <label class="settings-field">
                  <span>{{ t('settings.activeTesting.concurrency') }}</span>
                  <input
                    type="number"
                    min="1"
                    :value="settingValue('activeTesting.concurrency')"
                    @input="update('activeTesting.concurrency', Number($event.target.value))"
                  />
                </label>
                <label class="settings-field">
                  <span>{{ t('settings.activeTesting.failureThreshold') }}</span>
                  <input
                    type="number"
                    min="1"
                    :value="settingValue('activeTesting.failureThreshold')"
                    @input="update('activeTesting.failureThreshold', Number($event.target.value))"
                  />
                </label>
                <label class="settings-field">
                  <span>{{ t('settings.activeTesting.retentionDays') }}</span>
                  <input
                    type="number"
                    min="1"
                    :value="settingValue('activeTesting.retentionDays')"
                    @input="update('activeTesting.retentionDays', Number($event.target.value))"
                  />
                </label>
                <label class="settings-field active-testing-model-field">
                  <span>{{ t('settings.activeTesting.defaultModel') }}</span>
                  <input
                    type="text"
                    autocomplete="off"
                    :placeholder="t('settings.activeTesting.defaultModelPlaceholder')"
                    :value="settingValue('activeTesting.defaultModel')"
                    @input="update('activeTesting.defaultModel', $event.target.value)"
                  />
                  <small>{{ t('settings.activeTesting.defaultModelHint') }}</small>
                </label>
              </div>
            </div>
          </div>

          <div
            v-else-if="activeSettingsTab === 'llm'"
            class="settings-stack"
            role="tabpanel"
          >
            <div class="settings-section">
              <div class="settings-section-title">
                <Brain :size="18" />
                <span>{{ t('settings.llm.connectionTitle') }}</span>
              </div>
              <div class="settings-llm-grid">
                <label class="settings-field">
                  <span>{{ t('settings.llm.baseUrl') }}</span>
                  <input
                    type="url"
                    autocomplete="off"
                    :placeholder="t('settings.llm.baseUrlPlaceholder')"
                    :value="settings.llm.baseUrl"
                    @input="update('llm.baseUrl', $event.target.value)"
                  />
                </label>
                <label class="settings-field">
                  <span>{{ t('settings.llm.model') }}</span>
                  <div class="settings-model-row">
                    <CustomSelect
                      searchable
                      allowCustom
                      :modelValue="settings.llm.model"
                      :options="llmModelOptions"
                      :placeholder="t('settings.llm.modelPlaceholder')"
                      @update:modelValue="update('llm.model', $event)"
                    />
                    <button
                      class="bento-btn icon-btn"
                      type="button"
                      :disabled="llmModelsLoading"
                      :aria-label="t('settings.llm.fetchModels')"
                      :title="t('settings.llm.fetchModels')"
                      @click="emit('fetchLlmModels')"
                    >
                      <RefreshCw :size="18" />
                    </button>
                  </div>
                  <small v-if="llmModelsLoading || !llmModels.length">
                    {{
                      llmModelsLoading
                        ? t('settings.llm.fetchingModels')
                        : t('settings.llm.modelHint')
                    }}
                  </small>
                </label>
              </div>
            </div>

            <div class="settings-section">
              <div class="settings-section-title">
                <KeyRound :size="18" />
                <span>{{ t('settings.llm.apiKeyTitle') }}</span>
              </div>

              <div
                class="status-pill compact"
                :class="settings.llm.hasApiKey && !settings.llm.clearApiKey ? 'ok' : 'warn'"
              >
                <span class="status-dot"></span>
                {{
                  settings.llm.hasApiKey && !settings.llm.clearApiKey
                    ? t('settings.llm.configured')
                    : t('settings.llm.notConfigured')
                }}
              </div>

              <div class="settings-key-row">
                <label class="settings-field settings-key-field">
                  <span>{{ t('settings.llm.apiKey') }}</span>
                  <input
                    type="password"
                    autocomplete="new-password"
                    :placeholder="
                      settings.llm.hasApiKey
                        ? t('settings.llm.apiKeyKeepPlaceholder')
                        : t('settings.llm.apiKeyPlaceholder')
                    "
                    :value="settings.llm.apiKey"
                    :disabled="settings.llm.clearApiKey"
                    @input="updateApiKey($event.target.value)"
                  />
                  <small>{{ t('settings.llm.apiKeyHint') }}</small>
                </label>

                <button
                  class="setting-switch settings-clear-key"
                  :class="{ active: settings.llm.clearApiKey }"
                  type="button"
                  :aria-pressed="settings.llm.clearApiKey"
                  @click="toggleClearApiKey"
                >
                  {{
                    settings.llm.clearApiKey
                      ? t('settings.llm.clearEnabled')
                      : t('settings.llm.clearKey')
                  }}
                </button>
              </div>
            </div>
          </div>

          <div
            v-else-if="activeSettingsTab === 'storage'"
            class="settings-stack"
            role="tabpanel"
          >
            <div class="settings-section">
              <div class="settings-section-title">
                <Database :size="18" />
                <span>{{ t('settings.storage.policyTitle') }}</span>
              </div>
              <div class="settings-number-grid active-testing-grid">
                <label class="settings-field">
                  <span>{{ t('settings.storage.maxReports') }}</span>
                  <input
                    type="number"
                    min="1"
                    :value="settingValue('storage.maxReports')"
                    @input="update('storage.maxReports', Number($event.target.value))"
                  />
                  <small>{{ t('settings.storage.maxReportsHint') }}</small>
                </label>
                <label class="settings-field">
                  <span>{{ t('settings.storage.maxActionAuditEntries') }}</span>
                  <input
                    type="number"
                    min="1"
                    :value="settingValue('storage.maxActionAuditEntries')"
                    @input="update('storage.maxActionAuditEntries', Number($event.target.value))"
                  />
                  <small>{{ t('settings.storage.maxActionAuditEntriesHint') }}</small>
                </label>
              </div>
            </div>
          </div>

        </div>
      </article>

      <Teleport to="body">
        <Transition name="toast-slide">
          <div
            v-if="promptEditorConfig"
            class="prompt-editor-overlay"
            role="dialog"
            aria-modal="true"
            :aria-label="promptEditorConfig.title"
          >
            <section class="prompt-editor-dialog">
              <header class="prompt-editor-header">
                <div>
                  <h3>{{ promptEditorConfig.title }}</h3>
                  <p>{{ promptEditorConfig.hint }}</p>
                </div>
                <button
                  class="bento-btn icon-btn"
                  type="button"
                  :aria-label="t('common.close')"
                  :title="t('common.close')"
                  @click="closePromptEditor"
                >
                  <X :size="18" />
                </button>
              </header>

              <textarea
                v-model="promptEditorDraft"
                class="prompt-editor-textarea"
                :placeholder="promptEditorConfig.placeholder"
              ></textarea>

              <footer class="prompt-editor-actions">
                <button
                  class="bento-btn"
                  type="button"
                  @click="closePromptEditor"
                >
                  <X :size="16" />
                  <span>{{ t('common.cancel') }}</span>
                </button>
                <button
                  class="bento-btn primary"
                  type="button"
                  @click="applyPromptEditor"
                >
                  <Check :size="16" />
                  <span>{{ t('common.done') }}</span>
                </button>
              </footer>
            </section>
          </div>
        </Transition>
      </Teleport>
    </template>
  </div>
</template>
