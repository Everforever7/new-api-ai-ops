<script setup>
import { computed, ref } from 'vue'
import {
  Activity,
  BarChart3,
  Brain,
  Edit3,
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
    id: 'llm',
    icon: KeyRound,
    label: props.t('settings.llm.title'),
  },
  {
    id: 'protected',
    icon: Lock,
    label: props.t('settings.protected.title'),
  },
])

function settingValue(path) {
  return path.split('.').reduce((value, key) => value?.[key], props.settings)
}

function update(path, value) {
  emit('updateSetting', path, value)
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

function listText(path) {
  const value = settingValue(path)
  return Array.isArray(value) ? value.join('\n') : ''
}

function updateList(path, text, type = 'string') {
  const parts = text
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean)

  const value =
    type === 'number'
      ? [...new Set(parts.map(Number).filter((item) => Number.isInteger(item)))]
      : [...new Set(parts)]

  update(path, value)
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

            <label class="settings-field prompt-custom-field">
              <span>{{ t('settings.prompt.customInstructions') }}</span>
              <textarea
                :placeholder="t('settings.prompt.customPlaceholder')"
                :value="settings.prompt.customInstructions"
                @input="update('prompt.customInstructions', $event.target.value)"
              ></textarea>
            </label>
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
                    <input
                      type="text"
                      autocomplete="off"
                      list="llm-model-options"
                      :placeholder="t('settings.llm.modelPlaceholder')"
                      :value="settings.llm.model"
                      @input="update('llm.model', $event.target.value)"
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
                  <datalist id="llm-model-options">
                    <option
                      v-for="model in llmModelOptions"
                      :key="model"
                      :value="model"
                    />
                  </datalist>
                  <small>
                    {{
                      llmModelsLoading
                        ? t('settings.llm.fetchingModels')
                        : llmModelOptions.length
                          ? t('settings.llm.modelsLoaded', { count: llmModelOptions.length })
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
            v-else-if="activeSettingsTab === 'protected'"
            class="settings-protected-grid"
            role="tabpanel"
          >
            <label class="settings-field">
              <span>{{ t('settings.protected.ids') }}</span>
              <textarea
                :value="listText('aiExecution.protectedChannels.ids')"
                @input="
                  updateList(
                    'aiExecution.protectedChannels.ids',
                    $event.target.value,
                    'number'
                  )
                "
              ></textarea>
            </label>
            <label class="settings-field">
              <span>{{ t('settings.protected.groups') }}</span>
              <textarea
                :value="listText('aiExecution.protectedChannels.groups')"
                @input="
                  updateList(
                    'aiExecution.protectedChannels.groups',
                    $event.target.value
                  )
                "
              ></textarea>
            </label>
            <label class="settings-field">
              <span>{{ t('settings.protected.tags') }}</span>
              <textarea
                :value="listText('aiExecution.protectedChannels.tags')"
                @input="
                  updateList(
                    'aiExecution.protectedChannels.tags',
                    $event.target.value
                  )
                "
              ></textarea>
            </label>
            <label class="settings-field">
              <span>{{ t('settings.protected.names') }}</span>
              <textarea
                :value="listText('aiExecution.protectedChannels.nameIncludes')"
                @input="
                  updateList(
                    'aiExecution.protectedChannels.nameIncludes',
                    $event.target.value
                  )
                "
              ></textarea>
            </label>
            <label class="settings-field">
              <span>{{ t('settings.protected.models') }}</span>
              <textarea
                :value="listText('aiExecution.protectedChannels.modelIncludes')"
                @input="
                  updateList(
                    'aiExecution.protectedChannels.modelIncludes',
                    $event.target.value
                  )
                "
              ></textarea>
            </label>
            <label class="settings-field">
              <span>{{ t('settings.protected.types') }}</span>
              <textarea
                :value="listText('aiExecution.protectedChannels.types')"
                @input="
                  updateList(
                    'aiExecution.protectedChannels.types',
                    $event.target.value,
                    'number'
                  )
                "
              ></textarea>
            </label>
          </div>
        </div>
      </article>
    </template>
  </div>
</template>
