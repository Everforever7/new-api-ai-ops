<script setup>
import {
  CheckCircle2,
  CircleOff,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-vue-next'

const props = defineProps({
  actions: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  executingActionIds: { type: Array, default: () => [] },
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

function isExecuting(actionId) {
  return props.executingActionIds.includes(actionId)
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

    <article class="bento-item bento-full table-bento">
      <div class="bento-header">
        <h3>{{ t('actions.queueTitle') }}</h3>
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
                    {{ action.target || t('actions.noTarget') }}
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
              </div>
            </div>

            <p class="action-reason">{{ action.reason }}</p>
            <p v-if="action.statusReason" class="action-status-reason">
              {{ action.statusReason }}
            </p>

            <pre v-if="action.payload" class="minimal-pre action-payload">{{
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
    </article>
  </div>
</template>
