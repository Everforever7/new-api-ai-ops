<script setup>
import {
  CheckCircle2,
  CircleOff,
  Clock3,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-vue-next'

const props = defineProps({
  actions: { type: Array, required: true },
  auditActions: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  executingActionIds: { type: Array, default: () => [] },
  formatDate: { type: Function, required: true },
  t: { type: Function, required: true },
})

const emit = defineEmits(['executeAction', 'rejectAction', 'refreshActions'])

function actionLabel(action) {
  return props.t(`actions.labels.${action.action}`)
}

function statusLabel(status) {
  return props.t(`actions.status.${status}`)
}

function statusClass(status) {
  if (status === 'executed') return 'ok'
  if (status === 'pending_confirmation') return 'warn'
  if (status === 'failed' || status === 'blocked' || status === 'rejected') {
    return 'danger'
  }
  return ''
}

function sourceLabel(source) {
  return props.t(`actions.source.${source || 'unknown'}`)
}

function isExecuting(actionId) {
  return props.executingActionIds.includes(actionId)
}

function actionTime(action) {
  if (action.status === 'executed' && action.executedAt) {
    return {
      label: props.t('actions.time.executedAt'),
      value: props.formatDate(action.executedAt),
    }
  }

  if (action.status === 'pending_confirmation' || action.status === 'queued') {
    return {
      label: props.t('actions.time.createdAt'),
      value: props.formatDate(action.createdAt),
    }
  }

  return {
    label: props.t('actions.time.updatedAt'),
    value: props.formatDate(action.updatedAt || action.createdAt),
  }
}

function actionTarget(action) {
  if (action.channelName) return action.channelName
  if (action.target && !/^channel:\d+$/i.test(action.target)) return action.target
  return props.t('actions.noTarget')
}

function createChannelPayload(action) {
  if (action.action !== 'create_channel') return null
  const payload = action.payload || {}
  const channel = payload.channel || payload
  return channel && typeof channel === 'object'
    ? { mode: payload.mode, channel }
    : null
}

function createChannelFields(action) {
  const payload = createChannelPayload(action)
  if (!payload) return []
  const channel = payload.channel
  return [
    ['name', props.t('actions.createPreview.name'), channel.name || actionTarget(action)],
    ['type', props.t('actions.createPreview.type'), channel.type],
    ['base_url', props.t('actions.createPreview.baseUrl'), channel.base_url],
    ['models', props.t('actions.createPreview.models'), channel.models],
    ['group', props.t('actions.createPreview.group'), channel.group],
    ['priority', props.t('actions.createPreview.priority'), channel.priority],
    ['weight', props.t('actions.createPreview.weight'), channel.weight],
    ['auto_ban', props.t('actions.createPreview.autoBan'), channel.auto_ban],
    ['remark', props.t('actions.createPreview.remark'), channel.remark],
  ]
    .filter(([, , value]) => value !== undefined && value !== null && value !== '')
    .map(([key, label, value]) => ({ key, label, value: String(value) }))
}

function createChannelKeyState(action) {
  const payload = createChannelPayload(action)
  const key = payload?.channel?.key
  return key ? props.t('actions.createPreview.keyConfigured') : props.t('actions.createPreview.keyMissing')
}
</script>

<template>
  <div class="bento-grid">
    <article class="bento-item bento-hero">
      <div class="hero-content">
        <h2>{{ t('actions.title') }}</h2>
        <div class="status-pill" :class="actions.length ? 'warn' : 'ok'">
          <div class="status-dot"></div>
          {{
            actions.length
              ? t('actions.summary', { count: actions.length })
              : t('actions.empty')
          }}
        </div>
      </div>
    </article>

    <div class="actions-split">
      <article class="bento-item adaptive-bento actions-pane">
        <div class="bento-header">
          <div>
            <h3>{{ t('actions.queueTitle') }}</h3>
            <p class="settings-help-text">{{ t('actions.queueHint') }}</p>
          </div>
          <button
            class="bento-btn icon-btn"
            type="button"
            :disabled="loading"
            :aria-label="t('actions.refresh')"
            :title="t('actions.refresh')"
            @click="emit('refreshActions')"
          >
            <RefreshCw :size="18" />
          </button>
        </div>

        <div class="bento-body">
          <div v-if="loading" class="actions-empty">
            {{ t('actions.loading') }}
          </div>

          <div v-else-if="!actions.length" class="actions-empty">
            {{ t('actions.empty') }}
          </div>

          <div v-else class="actions-list">
            <article
              v-for="action in actions"
              :key="action.id"
              class="action-card"
            >
              <div class="action-card-main">
                <div class="action-card-top">
                  <div class="action-meta">
                    <div class="action-icon">
                      <Sparkles :size="18" />
                    </div>
                    <div>
                      <div class="action-title">{{ actionLabel(action) }}</div>
                      <div class="action-subtitle">
                        {{ actionTarget(action) }}
                      </div>
                    </div>
                  </div>
                  <div class="action-badges">
                    <span class="status-pill compact" :class="statusClass(action.status)">
                      <span class="status-dot"></span>
                      {{ statusLabel(action.status) }}
                    </span>
                    <span class="action-risk" :class="action.risk">
                      <ShieldAlert :size="14" />
                      {{ t(`actions.risk.${action.risk}`) }}
                    </span>
                    <span class="action-time">
                      <Clock3 :size="14" />
                      {{ actionTime(action).label }} {{ actionTime(action).value }}
                    </span>
                  </div>
                </div>

                <p class="action-reason">{{ action.reason }}</p>
                <p v-if="action.statusReason" class="action-status-reason">
                  {{ action.statusReason }}
                </p>

                <div
                  v-if="createChannelPayload(action)"
                  class="create-action-preview"
                >
                  <div class="create-action-key-row">
                    <span>{{ t('actions.createPreview.apiKey') }}</span>
                    <strong>{{ createChannelKeyState(action) }}</strong>
                  </div>
                  <div class="create-action-grid">
                    <div
                      v-for="field in createChannelFields(action)"
                      :key="field.key"
                      class="create-action-field"
                    >
                      <span>{{ field.label }}</span>
                      <strong>{{ field.value }}</strong>
                    </div>
                  </div>
                </div>

                <pre v-else-if="action.payload" class="minimal-pre action-payload">{{
                  JSON.stringify(action.payload, null, 2)
                }}</pre>
              </div>

              <div class="action-card-actions">
                <button
                  v-if="action.status === 'pending_confirmation' || action.status === 'queued'"
                  class="bento-btn primary"
                  type="button"
                  :disabled="isExecuting(action.id)"
                  @click="emit('executeAction', action.id)"
                >
                  <Play :size="16" />
                  <span>{{
                    isExecuting(action.id)
                      ? t('actions.executing')
                      : t('actions.execute')
                  }}</span>
                </button>

                <button
                  v-if="action.status === 'pending_confirmation' || action.status === 'queued'"
                  class="bento-btn"
                  type="button"
                  :disabled="isExecuting(action.id)"
                  @click="emit('rejectAction', action.id)"
                >
                  <XCircle :size="16" />
                  <span>{{ t('actions.reject') }}</span>
                </button>

                <div v-else class="action-finish-mark" :class="statusClass(action.status)">
                  <CheckCircle2 v-if="action.status === 'executed'" :size="18" />
                  <CircleOff v-else :size="18" />
                  <span>{{ statusLabel(action.status) }}</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </article>

      <article class="bento-item adaptive-bento actions-pane">
        <div class="bento-header">
          <div>
            <h3>{{ t('actions.auditTitle') }}</h3>
            <p class="settings-help-text">{{ t('actions.auditHint') }}</p>
          </div>
          <button
            class="bento-btn icon-btn"
            type="button"
            :disabled="loading"
            :aria-label="t('actions.refresh')"
            :title="t('actions.refresh')"
            @click="emit('refreshActions')"
          >
            <RefreshCw :size="18" />
          </button>
        </div>

        <div class="bento-body">
          <div v-if="loading" class="actions-empty">
            {{ t('actions.loading') }}
          </div>

          <div v-else-if="!auditActions.length" class="actions-empty">
            {{ t('actions.auditEmpty') }}
          </div>

          <div v-else class="actions-list">
            <article
              v-for="action in auditActions"
              :key="`audit-${action.id}-${action.updatedAt || action.executedAt || action.createdAt}`"
              class="action-card action-card-audit"
            >
              <div class="action-card-main">
                <div class="action-card-top">
                  <div class="action-meta">
                    <div class="action-icon">
                      <Sparkles :size="18" />
                    </div>
                    <div>
                      <div class="action-title">{{ actionLabel(action) }}</div>
                      <div class="action-subtitle">
                        {{ actionTarget(action) }}
                      </div>
                    </div>
                  </div>
                  <div class="action-badges">
                    <span class="status-pill compact" :class="statusClass(action.status)">
                      <span class="status-dot"></span>
                      {{ statusLabel(action.status) }}
                    </span>
                    <span class="action-source">
                      {{ sourceLabel(action.source) }}
                    </span>
                    <span class="action-time">
                      <Clock3 :size="14" />
                      {{ actionTime(action).label }} {{ actionTime(action).value }}
                    </span>
                  </div>
                </div>

                <p class="action-reason">{{ action.reason }}</p>
                <p v-if="action.statusReason" class="action-status-reason">
                  {{ action.statusReason }}
                </p>

                <div
                  v-if="createChannelPayload(action)"
                  class="create-action-preview"
                >
                  <div class="create-action-key-row">
                    <span>{{ t('actions.createPreview.apiKey') }}</span>
                    <strong>{{ createChannelKeyState(action) }}</strong>
                  </div>
                  <div class="create-action-grid">
                    <div
                      v-for="field in createChannelFields(action)"
                      :key="field.key"
                      class="create-action-field"
                    >
                      <span>{{ field.label }}</span>
                      <strong>{{ field.value }}</strong>
                    </div>
                  </div>
                </div>

                <pre v-else-if="action.payload" class="minimal-pre action-payload">{{
                  JSON.stringify(action.payload, null, 2)
                }}</pre>
              </div>
            </article>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
