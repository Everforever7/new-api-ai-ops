<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  Bot,
  ClipboardList,
  RefreshCcw,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-vue-next'

const props = defineProps({
  session: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  sending: { type: Boolean, default: false },
  resetting: { type: Boolean, default: false },
  t: { type: Function, required: true },
})

const emit = defineEmits(['sendMessage', 'resetSession', 'openActions'])

const draft = ref('')
const messagesEnd = ref(null)

const messages = computed(() => props.session?.messages || [])
const lastActions = computed(() => props.session?.lastActions || [])
const memorySummary = computed(() => props.session?.lastMemorySummary || [])
const canSend = computed(() => draft.value.trim().length > 0 && !props.sending)

function scrollMessagesToEnd() {
  nextTick(() => {
    messagesEnd.value?.scrollIntoView({ block: 'end' })
  })
}

watch(
  () => messages.value.length,
  scrollMessagesToEnd
)

watch(
  () => messages.value.map((item) => `${item.id}:${item.content}`).join('\n'),
  scrollMessagesToEnd
)

function sendMessage() {
  const value = draft.value.trim()
  if (!value || props.sending) return
  emit('sendMessage', value)
  draft.value = ''
}

function actionLabel(action) {
  return props.t(`actions.labels.${action.action}`)
}

function actionTarget(action) {
  if (action.channelName) return action.channelName
  if (action.target && !/^channel:\d+$/i.test(action.target)) return action.target
  return props.t('actions.noTarget')
}

function statusLabel(action) {
  return props.t(`actions.status.${action.status}`)
}

function riskLabel(action) {
  return props.t(`actions.risk.${action.risk}`)
}

function formatPayload(payload) {
  return JSON.stringify(payload, null, 2)
}

function isPendingAssistantMessage(item) {
  return item.role === 'assistant' && !item.content && props.sending
}

function memoryStatusClass(memory) {
  if (memory.lastStatus === 'success') return 'ok'
  if (memory.lastStatus === 'failed') return 'danger'
  return 'warn'
}

function memoryStatusLabel(memory) {
  if (memory.lastStatus === 'success') return props.t('assistant.memorySuccess')
  if (memory.lastStatus === 'failed') return props.t('assistant.memoryFailed')
  return props.t('assistant.memoryUnknown')
}

function memoryMeta(memory) {
  const parts = []
  if (typeof memory.successRate === 'number') {
    parts.push(`${Math.round(memory.successRate * 100)}%`)
  }
  if (memory.consecutiveFailures) {
    parts.push(props.t('assistant.memoryFailures', {
      count: memory.consecutiveFailures,
    }))
  }
  if (memory.protected) {
    parts.push(props.t('assistant.memoryProtected'))
  }
  return parts.join(' · ') || props.t('common.emptyValue')
}

function memoryName(memory) {
  return memory.channelName || props.t('channels.unnamed')
}
</script>

<template>
  <div class="bento-grid">
    <article class="bento-item bento-hero">
      <div class="hero-content">
        <h2>{{ t('assistant.title') }}</h2>
        <div class="status-pill ok">
          <div class="status-dot"></div>
          {{ t('assistant.subtitle') }}
        </div>
      </div>
    </article>

    <article class="bento-item bento-full adaptive-bento assistant-bento">
      <div class="bento-header">
        <h3>{{ t('assistant.conversationTitle') }}</h3>
        <div class="assistant-header-actions">
          <button
            class="bento-btn"
            type="button"
            :disabled="resetting || loading"
            @click="emit('resetSession')"
          >
            <RefreshCcw :size="16" />
            <span>{{ resetting ? t('assistant.resetting') : t('assistant.reset') }}</span>
          </button>
        </div>
      </div>

      <div class="bento-body assistant-body">
        <div class="assistant-layout">
          <section class="assistant-conversation">
            <div class="assistant-messages">
              <div v-if="loading" class="assistant-empty">
                {{ t('assistant.loading') }}
              </div>

              <div v-else-if="!messages.length" class="assistant-empty">
                <Bot :size="28" />
                <span>{{ t('assistant.empty') }}</span>
              </div>

              <template v-else>
                <article
                  v-for="item in messages"
                  :key="item.id"
                  class="assistant-message"
                  :class="item.role"
                >
                  <div class="assistant-message-icon">
                    <UserRound v-if="item.role === 'user'" :size="16" />
                    <Sparkles v-else :size="16" />
                  </div>
                  <div class="assistant-message-copy">
                    <div class="assistant-message-role">
                      {{
                        item.role === 'user'
                          ? t('assistant.userLabel')
                          : t('assistant.assistantLabel')
                      }}
                    </div>
                    <p
                      :class="{
                        'assistant-message-pending': isPendingAssistantMessage(item),
                      }"
                    >
                      <template v-if="isPendingAssistantMessage(item)">
                        <span>{{ t('assistant.generating') }}</span>
                        <span class="assistant-typing-dots" aria-hidden="true">
                          <span></span>
                          <span></span>
                          <span></span>
                        </span>
                      </template>
                      <template v-else>{{ item.content }}</template>
                    </p>
                  </div>
                </article>
              </template>

              <div ref="messagesEnd"></div>
            </div>

            <form class="assistant-composer" @submit.prevent="sendMessage">
              <textarea
                v-model="draft"
                :placeholder="t('assistant.inputPlaceholder')"
                :disabled="sending"
                maxlength="6000"
                rows="3"
                @keydown.enter.exact.prevent="sendMessage"
              ></textarea>
              <button
                class="bento-btn primary icon-btn"
                type="submit"
                :disabled="!canSend"
                :aria-label="sending ? t('assistant.sending') : t('assistant.send')"
                :title="sending ? t('assistant.sending') : t('assistant.send')"
              >
                <Send :size="18" />
              </button>
            </form>
          </section>

          <aside class="assistant-actions">

            <div class="assistant-actions-title">
              <ClipboardList :size="18" />
              <span>{{ t('assistant.actionsTitle') }}</span>
            </div>

            <div v-if="!lastActions.length" class="assistant-action-empty">
              {{ t('assistant.noActions') }}
            </div>

            <div v-else class="assistant-action-list">
              <article
                v-for="action in lastActions"
                :key="action.id"
                class="assistant-action-item"
              >
                <div class="assistant-action-top">
                  <strong>{{ actionLabel(action) }}</strong>
                  <span class="status-pill compact" :class="action.status === 'blocked' ? 'danger' : 'warn'">
                    <span class="status-dot"></span>
                    {{ statusLabel(action) }}
                  </span>
                </div>
                <p>{{ action.reason }}</p>
                <div class="assistant-action-meta">
                  <span>{{ riskLabel(action) }}</span>
                  <span>{{ actionTarget(action) }}</span>
                </div>
                <pre v-if="action.payload" class="minimal-pre assistant-action-payload">{{
                  formatPayload(action.payload)
                }}</pre>
              </article>
            </div>

            <button
              class="bento-btn assistant-open-actions"
              type="button"
              @click="emit('openActions')"
            >
              <ClipboardList :size="16" />
              <span>{{ t('assistant.openActions') }}</span>
            </button>
          </aside>
        </div>
      </div>
    </article>
  </div>
</template>
