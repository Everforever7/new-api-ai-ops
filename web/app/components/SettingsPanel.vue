<script setup>
import { computed } from 'vue'
import {
  Activity,
  BarChart3,
  Brain,
  Edit3,
  Gauge,
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
  t: { type: Function, required: true },
})

const emit = defineEmits(['updateSetting', 'saveSettings', 'reloadSettings'])

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

function settingValue(path) {
  return path.split('.').reduce((value, key) => value?.[key], props.settings)
}

function update(path, value) {
  emit('updateSetting', path, value)
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

      <article class="bento-item bento-full settings-execution high-density">
        <div class="bento-header">
          <div class="bento-icon-wrapper">
            <ShieldCheck :size="24" />
          </div>
          <h3>{{ t('settings.execution.title') }}</h3>
        </div>

        <div class="settings-stack">
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
      </article>

      <article class="bento-item bento-full settings-prompt high-density">
        <div class="bento-header">
          <div class="bento-icon-wrapper">
            <Brain :size="24" />
          </div>
          <h3>{{ t('settings.prompt.title') }}</h3>
        </div>

        <div class="settings-stack">
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
      </article>

      <article class="bento-item bento-full settings-protected high-density">
        <div class="bento-header">
          <h3>{{ t('settings.protected.title') }}</h3>
        </div>
        <div class="settings-protected-grid">
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
      </article>
    </template>
  </div>
</template>
