<script setup>
import { computed, ref } from 'vue'
import {
  Check,
  FlaskConical,
  History,
  Play,
  Search,
  ShieldCheck,
  StickyNote,
  X,
} from 'lucide-vue-next'

const props = defineProps({
  channels: { type: Array, required: true },
  channelMemories: { type: Object, default: () => ({}) },
  settings: { type: Object, default: null },
  protectedSavingIds: { type: Array, default: () => [] },
  testingChannelIds: { type: Array, default: () => [] },
  testingAllChannels: { type: Boolean, default: false },
  memorySavingIds: { type: Array, default: () => [] },
  testHistoryChannel: { type: Object, default: null },
  testHistoryRuns: { type: Array, default: () => [] },
  testHistoryLoading: { type: Boolean, default: false },
  t: { type: Function, required: true },
  formatBalance: { type: Function, required: true },
  formatLatency: { type: Function, required: true },
  formatDate: { type: Function, required: true },
  formatPercent: { type: Function, required: true },
})

const emit = defineEmits([
  'toggleProtectedChannel',
  'testChannel',
  'testEnabledChannels',
  'saveChannelNote',
  'openTestHistory',
  'closeTestHistory',
])

const query = ref('')
const noteEditorChannel = ref(null)
const noteEditorDraft = ref('')

const protectedChannelIds = computed(() => {
  const ids = props.settings?.aiExecution?.protectedChannels?.ids
  return new Set(
    Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : []
  )
})

const filteredChannels = computed(() => {
  const text = query.value.trim().toLowerCase()
  if (!text) return props.channels

  return props.channels.filter((channel) => {
    const memory = memoryFor(channel)
    return [
      channel.id,
      channel.name,
      channel.group,
      channel.tag,
      channel.models,
      channel.type,
      channel.priority,
      channel.weight,
      memory?.manualNote,
      memory?.aiObservation,
    ]
      .filter((value) => value !== undefined && value !== null)
      .join(' ')
      .toLowerCase()
      .includes(text)
  })
})

const protectedCount = computed(() => protectedChannelIds.value.size)

function formatChannelStatus(channel) {
  if (channel.status === 1) return props.t('channelStatus.enabled')
  if (channel.status === 2) return props.t('channelStatus.autoDisabled')
  if (channel.status === 0) return props.t('channelStatus.disabled')
  return channel.statusLabel || props.t('channelStatus.unknown')
}

function channelStatusClass(channel) {
  if (channel.status === 1) return 'ok'
  if (channel.status === 2) return 'warn'
  return 'danger'
}

function memoryFor(channel) {
  return props.channelMemories[String(channel.id)] || null
}

function channelDisplayName(channel) {
  return channel.name || props.t('channels.unnamed')
}

function isProtected(channelId) {
  return protectedChannelIds.value.has(Number(channelId))
}

function isSaving(channelId) {
  return props.protectedSavingIds.includes(Number(channelId))
}

function isTesting(channelId) {
  return props.testingChannelIds.includes(Number(channelId))
}

function isMemorySaving(channelId) {
  return props.memorySavingIds.includes(Number(channelId))
}

function detailParts(channel) {
  return [
    channel.group ? `${props.t('channels.group')}: ${channel.group}` : '',
    channel.tag ? `${props.t('channels.tag')}: ${channel.tag}` : '',
    channel.type !== undefined ? `${props.t('channels.type')}: ${channel.type}` : '',
  ].filter(Boolean)
}

function weightText(channel) {
  const parts = []
  if (channel.priority !== undefined && channel.priority !== null) {
    parts.push(`${props.t('channels.priority')}: ${channel.priority}`)
  }
  if (channel.weight !== undefined && channel.weight !== null) {
    parts.push(`${props.t('channels.weight')}: ${channel.weight}`)
  }
  return parts.join(' / ') || props.t('common.emptyValue')
}

function modelsText(channel) {
  return channel.models || props.t('common.emptyValue')
}

function testSummary(channel) {
  return memoryFor(channel)?.testSummary || null
}

function testStatusClass(channel) {
  const summary = testSummary(channel)
  if (summary?.lastStatus === 'success') return 'ok'
  if (summary?.lastStatus === 'failed') return 'danger'
  return 'warn'
}

function runStatusClass(run) {
  return run.status === 'success' ? 'ok' : 'danger'
}

function runStatusText(run) {
  return run.status === 'success'
    ? props.t('channels.testSuccess')
    : props.t('channels.testFailed')
}

function runLatency(run) {
  return typeof run.latencyMs === 'number'
    ? props.formatLatency(run.latencyMs)
    : props.t('common.emptyValue')
}

function runError(run) {
  return run.error || run.responseSummary || props.t('common.emptyValue')
}

function testStatusText(channel) {
  const summary = testSummary(channel)
  if (summary?.lastStatus === 'success') return props.t('channels.testSuccess')
  if (summary?.lastStatus === 'failed') return props.t('channels.testFailed')
  return props.t('channels.notTested')
}

function testMeta(channel) {
  const summary = testSummary(channel)
  if (!summary?.lastTestedAt) return props.t('channels.noTestHistory')

  const parts = [
    props.t('channels.successRate', {
      value: props.formatPercent(summary.successRate),
    }),
  ]

  if (summary.consecutiveFailures) {
    parts.push(
      props.t('channels.consecutiveFailures', {
        count: summary.consecutiveFailures,
      })
    )
  }

  if (summary.lastLatencyMs !== undefined) {
    parts.push(props.formatLatency(summary.lastLatencyMs))
  }

  return parts.join(' · ')
}

function notePreview(channel) {
  const memory = memoryFor(channel)
  return memory?.manualNote || memory?.aiObservation || props.t('channels.noNote')
}

function openNoteEditor(channel) {
  noteEditorChannel.value = channel
  noteEditorDraft.value = memoryFor(channel)?.manualNote || ''
}

function closeNoteEditor() {
  noteEditorChannel.value = null
  noteEditorDraft.value = ''
}

function saveNote() {
  if (!noteEditorChannel.value) return
  emit('saveChannelNote', {
    channelId: noteEditorChannel.value.id,
    manualNote: noteEditorDraft.value,
  })
  closeNoteEditor()
}
</script>

<template>
  <div class="bento-grid">
    <article class="bento-item bento-hero">
      <div class="hero-content">
        <h2>{{ t('channels.title') }}</h2>
        <div class="status-pill warn">
          <div class="status-dot"></div>
          {{ t('channels.summary', { visible: filteredChannels.length, total: channels.length }) }}
        </div>
      </div>
    </article>

    <article class="bento-item bento-full adaptive-bento">
      <div class="bento-header channels-toolbar">
        <div>
          <h3>{{ t('channels.listTitle') }}</h3>
          <p class="settings-help-text">
            {{ t('channels.protectionHint', { count: protectedCount }) }}
          </p>
        </div>
        <div class="channels-toolbar-actions">
          <button
            class="bento-btn"
            type="button"
            :disabled="testingAllChannels"
            @click="emit('testEnabledChannels')"
          >
            <FlaskConical :size="16" />
            <span>{{ testingAllChannels ? t('channels.testing') : t('channels.testEnabled') }}</span>
          </button>
          <label class="channels-search" :aria-label="t('channels.search')">
            <Search :size="16" />
            <input
              v-model="query"
              type="search"
              autocomplete="off"
              :placeholder="t('channels.searchPlaceholder')"
            />
          </label>
        </div>
      </div>

      <div class="bento-body channels-list-wrap">
        <div v-if="!channels.length" class="channels-empty">
          {{ t('channels.empty') }}
        </div>

        <div v-else-if="!filteredChannels.length" class="channels-empty">
          {{ t('channels.noMatches') }}
        </div>

        <div v-else class="channels-list">
          <article
            v-for="channel in filteredChannels"
            :key="channel.id"
            class="channel-row"
          >
            <div class="channel-row-main">
              <div class="channel-id-chip">{{ channel.id }}</div>

              <div class="channel-title-block">
                <strong>{{ channelDisplayName(channel) }}</strong>
                <small>{{ detailParts(channel).join(' · ') || t('common.emptyValue') }}</small>
              </div>

              <span class="status-pill compact" :class="channelStatusClass(channel)">
                <span class="status-dot"></span>
                {{ formatChannelStatus(channel) }}
              </span>

              <div class="channel-test-summary">
                <span class="status-pill compact" :class="testStatusClass(channel)">
                  <span class="status-dot"></span>
                  {{ testStatusText(channel) }}
                </span>
                <small>{{ testMeta(channel) }}</small>
              </div>

              <button
                class="channel-protect-btn"
                :class="{ active: isProtected(channel.id) }"
                type="button"
                :disabled="!settings || isSaving(channel.id)"
                :aria-pressed="isProtected(channel.id)"
                @click="emit('toggleProtectedChannel', channel.id)"
              >
                <ShieldCheck :size="15" />
                <span>
                  {{
                    isSaving(channel.id)
                      ? t('channels.savingProtection')
                      : isProtected(channel.id)
                        ? t('channels.protected')
                        : t('channels.unprotected')
                  }}
                </span>
              </button>

              <div class="channel-row-actions">
                <button
                  class="channel-protect-btn channel-action-btn"
                  type="button"
                  :disabled="isTesting(channel.id) || testingAllChannels"
                  @click="emit('testChannel', channel.id)"
                >
                  <Play :size="14" />
                  <span>{{ isTesting(channel.id) ? t('channels.testing') : t('channels.test') }}</span>
                </button>
                <button
                  class="channel-protect-btn channel-action-btn"
                  type="button"
                  @click="emit('openTestHistory', channel)"
                >
                  <History :size="14" />
                  <span>{{ t('channels.history') }}</span>
                </button>
                <button
                  class="channel-protect-btn channel-action-btn"
                  type="button"
                  :disabled="isMemorySaving(channel.id)"
                  @click="openNoteEditor(channel)"
                >
                  <StickyNote :size="14" />
                  <span>{{ isMemorySaving(channel.id) ? t('channels.savingNote') : t('channels.editNote') }}</span>
                </button>
              </div>
            </div>

            <div class="channel-row-sub">
              <div class="channel-sub-item channel-sub-models">
                <span>{{ t('channels.models') }}</span>
                <strong :title="modelsText(channel)">{{ modelsText(channel) }}</strong>
              </div>
              <div class="channel-sub-item">
                <span>{{ t('channels.weighting') }}</span>
                <strong>{{ weightText(channel) }}</strong>
              </div>
              <div class="channel-sub-item">
                <span>{{ t('channels.balance') }}</span>
                <strong>{{ formatBalance(channel.balance) }}</strong>
              </div>
              <div class="channel-sub-item">
                <span>{{ t('channels.latency') }}</span>
                <strong>{{ formatLatency(channel.responseTimeMs) }}</strong>
              </div>
              <div class="channel-sub-item channel-sub-memory">
                <span>{{ t('channels.memory') }}</span>
                <strong :title="notePreview(channel)">{{ notePreview(channel) }}</strong>
              </div>
            </div>
          </article>
        </div>
      </div>
    </article>

    <Teleport to="body">
      <Transition name="toast-slide">
        <div
          v-if="noteEditorChannel"
          class="prompt-editor-overlay"
          role="dialog"
          aria-modal="true"
          :aria-label="t('channels.editNote')"
        >
          <section class="prompt-editor-dialog channel-note-dialog">
            <header class="prompt-editor-header">
              <div>
                <h3>{{ t('channels.editNoteTitle', { name: channelDisplayName(noteEditorChannel) }) }}</h3>
                <p>{{ t('channels.editNoteHint') }}</p>
              </div>
              <button
                class="bento-btn icon-btn"
                type="button"
                :aria-label="t('common.close')"
                :title="t('common.close')"
                @click="closeNoteEditor"
              >
                <X :size="18" />
              </button>
            </header>

            <textarea
              v-model="noteEditorDraft"
              class="prompt-editor-textarea"
              :placeholder="t('channels.notePlaceholder')"
            ></textarea>

            <footer class="prompt-editor-actions">
              <button
                class="bento-btn"
                type="button"
                @click="closeNoteEditor"
              >
                <X :size="16" />
                <span>{{ t('common.cancel') }}</span>
              </button>
              <button
                class="bento-btn primary"
                type="button"
                @click="saveNote"
              >
                <Check :size="16" />
                <span>{{ t('common.done') }}</span>
              </button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="toast-slide">
        <div
          v-if="testHistoryChannel"
          class="prompt-editor-overlay"
          role="dialog"
          aria-modal="true"
          :aria-label="t('channels.historyTitle', { name: channelDisplayName(testHistoryChannel) })"
        >
          <section class="prompt-editor-dialog channel-history-dialog">
            <header class="prompt-editor-header">
              <div>
                <h3>{{ t('channels.historyTitle', { name: channelDisplayName(testHistoryChannel) }) }}</h3>
                <p>{{ t('channels.historyHint') }}</p>
              </div>
              <button
                class="bento-btn icon-btn"
                type="button"
                :aria-label="t('common.close')"
                :title="t('common.close')"
                @click="emit('closeTestHistory')"
              >
                <X :size="18" />
              </button>
            </header>

            <div class="channel-history-body">
              <div v-if="testHistoryLoading" class="actions-empty">
                {{ t('channels.historyLoading') }}
              </div>
              <div v-else-if="!testHistoryRuns.length" class="actions-empty">
                {{ t('channels.historyEmpty') }}
              </div>
              <div v-else class="channel-history-list">
                <article
                  v-for="run in testHistoryRuns"
                  :key="run.id"
                  class="channel-history-item"
                >
                  <div class="assistant-action-top">
                    <span class="status-pill compact" :class="runStatusClass(run)">
                      <span class="status-dot"></span>
                      {{ runStatusText(run) }}
                    </span>
                    <span class="font-mono">{{ props.formatDate(run.endedAt) }}</span>
                  </div>
                  <div class="channel-history-meta">
                    <span>{{ t('channels.historyModel') }}: {{ run.model || t('common.emptyValue') }}</span>
                    <span>{{ t('channels.historyLatency') }}: {{ runLatency(run) }}</span>
                    <span>{{ t('channels.historySource') }}: {{ t(`channels.historySources.${run.triggeredBy}`) }}</span>
                  </div>
                  <p>{{ runError(run) }}</p>
                </article>
              </div>
            </div>

            <footer class="prompt-editor-actions">
              <button
                class="bento-btn primary"
                type="button"
                @click="emit('closeTestHistory')"
              >
                <Check :size="16" />
                <span>{{ t('common.done') }}</span>
              </button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
