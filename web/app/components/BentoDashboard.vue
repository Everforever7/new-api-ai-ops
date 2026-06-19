<script setup>
import { PlayCircle, RefreshCw, ServerCrash, BatteryWarning, Activity, FileText } from 'lucide-vue-next'

const props = defineProps({
  snapshot: { type: Object, default: null },
  currentTabName: { type: String, required: true },
  runState: { type: Object, required: true },
  lastRunText: { type: String, required: true },
  refreshing: { type: Boolean, default: false },
  runningCheck: { type: Boolean, default: false },
  slowestChannelText: { type: String, required: true },
  t: { type: Function, required: true },
  formatNumber: { type: Function, required: true },
  formatPercent: { type: Function, required: true }
})

const emit = defineEmits(['refreshAll', 'runManualCheck'])
</script>

<template>
  <div class="bento-grid">
    <!-- Hero Panel (Wide & Tall) -->
    <article class="bento-item bento-hero">
      <div class="hero-content">
        <h2>{{ currentTabName }}</h2>
        <div class="status-pill" :class="runState.className">
          <div class="status-dot"></div>
          {{ runState.label }}
        </div>
      </div>
      
      <div class="hero-actions">
        <div class="last-run">{{ lastRunText }}</div>
        <div class="buttons">
          <button class="bento-btn" type="button" :disabled="refreshing" @click="emit('refreshAll')" :title="t('toolbar.refresh')">
            <RefreshCw :size="18" :class="{ spin: refreshing }" />
          </button>
          <button class="bento-btn primary" type="button" :disabled="runningCheck" @click="emit('runManualCheck')">
            <PlayCircle v-if="!runningCheck" :size="18" />
            <RefreshCw v-else :size="18" class="spin" />
            <span>{{ runningCheck ? t('toolbar.checking') : t('toolbar.runNow') }}</span>
          </button>
        </div>
      </div>
    </article>

    <!-- Metric: Channels (Square) -->
    <article class="bento-item bento-square">
      <div class="bento-icon-wrapper"><ServerCrash :size="24"/></div>
      <div class="bento-data">
        <div class="bento-val">{{ formatNumber(snapshot?.channels.total) }}</div>
        <div class="bento-label">{{ t('dashboard.channelStatus') }}</div>
        <div class="bento-sub">{{ t('dashboard.channelSummary', { enabled: formatNumber(snapshot?.channels.enabled), autoDisabled: formatNumber(snapshot?.channels.autoDisabled) }) }}</div>
      </div>
    </article>

    <!-- Metric: Failure Rate (Square) -->
    <article class="bento-item bento-square">
      <div class="bento-icon-wrapper"><Activity :size="24"/></div>
      <div class="bento-data">
        <div class="bento-val">{{ formatPercent(snapshot?.logs.failureRate) }}</div>
        <div class="bento-label">{{ t('dashboard.failureRate') }}</div>
        <div class="bento-sub">{{ t('dashboard.throughput', { rpm: formatNumber(snapshot?.logs.rpm), tpm: formatNumber(snapshot?.logs.tpm) }) }}</div>
      </div>
    </article>

    <!-- Metric: Logs (Tall) -->
    <article class="bento-item bento-tall">
      <div class="bento-icon-wrapper"><FileText :size="24"/></div>
      <div class="bento-data">
        <div class="bento-val">{{ formatNumber(snapshot?.logs.total) }}</div>
        <div class="bento-label">{{ t('dashboard.recentLogs') }}</div>
        <div class="bento-sub">{{ t('dashboard.logSummary', { success: formatNumber(snapshot?.logs.success), errors: formatNumber(snapshot?.logs.errors) }) }}</div>
      </div>
    </article>

    <!-- Metric: Low Balance (Wide) -->
    <article class="bento-item bento-wide bento-highlight">
      <div class="bento-flex-row">
        <div class="bento-icon-wrapper warn"><BatteryWarning :size="28"/></div>
        <div class="bento-data flex-1">
          <div class="bento-label">{{ t('dashboard.lowBalance') }}</div>
          <div class="bento-val large">{{ formatNumber(snapshot?.channels.lowBalance?.length) }}</div>
          <div class="bento-sub">{{ slowestChannelText }}</div>
        </div>
      </div>
    </article>
  </div>
</template>
