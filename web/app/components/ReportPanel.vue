<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getReports } from '../api'
import { ChevronDown, ChevronRight, FileText, Loader2, Calendar } from 'lucide-vue-next'

const props = defineProps({
  t: { type: Function, required: true },
  formatDate: { type: Function, required: true }
})

const reports = ref([])
const loading = ref(true)
const expandedIds = ref(new Set())
let pollingTimer = null
const REPORT_TONE_COUNT = 6

async function loadReports() {
  try {
    reports.value = await getReports()
    if (reports.value.length > 0 && expandedIds.value.size === 0) {
      // Auto expand the most recent report
      expandedIds.value = new Set([reports.value[0].name])
    }
  } catch (err) {
    console.error('Failed to load reports', err)
  } finally {
    loading.value = false
  }
}

function toggleExpand(id) {
  const newSet = new Set(expandedIds.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  expandedIds.value = newSet
}

function reportToneClass(index) {
  return `report-tone-${index % REPORT_TONE_COUNT}`
}

onMounted(() => {
  loadReports()
  pollingTimer = setInterval(loadReports, 30000)
})

onUnmounted(() => {
  if (pollingTimer) clearInterval(pollingTimer)
})
</script>

<template>
  <div class="bento-grid">
    <article class="bento-item bento-hero">
      <div class="hero-content">
        <h2>{{ t('report.title') }}</h2>
        <div class="status-pill ok">
          <div class="status-dot"></div>
          {{ t('status.ready') }}
        </div>
      </div>
    </article>

    <article class="bento-item bento-full adaptive-bento report-bento">
       <div class="bento-header channels-toolbar">
         <div>
           <h3>{{ t('report.history') }}</h3>
           <p class="settings-help-text">{{ t('report.historyHint') }}</p>
         </div>
         <div class="channels-toolbar-actions">
           <button class="bento-btn" type="button" @click="loadReports" :disabled="loading">
             <Loader2 v-if="loading" :size="16" class="spin" />
             <FileText v-else :size="16" />
             <span>{{ t('toolbar.refresh') }}</span>
           </button>
         </div>
       </div>
       <div class="bento-body reports-list-wrap">
         <div v-if="!reports.length && !loading" class="channels-empty">
           {{ t('report.empty') }}
         </div>
         <div v-else class="reports-list">
           <div 
             v-for="(report, index) in reports"
             :key="report.name" 
             class="report-card" 
             :class="[
               { expanded: expandedIds.has(report.name) },
               reportToneClass(index),
             ]"
           >
             <div class="report-card-header" @click="toggleExpand(report.name)">
               <div class="report-meta">
                 <Calendar :size="16" />
                 <span class="report-date">{{ formatDate(report.mtimeMs) }}</span>
                 <span class="report-name">{{ report.name }}</span>
               </div>
               <button class="bento-btn icon-btn compact">
                 <ChevronDown v-if="expandedIds.has(report.name)" :size="16" />
                 <ChevronRight v-else :size="16" />
               </button>
             </div>
             <div v-show="expandedIds.has(report.name)" class="report-card-body">
               <pre class="minimal-pre">{{ report.content }}</pre>
             </div>
           </div>
         </div>
       </div>
    </article>
  </div>
</template>

<style scoped>
.reports-list-wrap {
  padding: 0 4px 10px 0;
}
.reports-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.report-card {
  --report-tone: var(--primary);
  --report-tone-bg: var(--primary-bg);
  --report-tone-border: color-mix(in srgb, var(--report-tone) 34%, var(--border));
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  overflow: hidden;
  transition: box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  box-shadow: inset 4px 0 0 var(--report-tone);
}
.report-card:hover {
  border-color: var(--report-tone-border);
  box-shadow: inset 4px 0 0 var(--report-tone), 0 4px 16px rgba(0, 0, 0, 0.04);
}
.report-card.report-tone-0 {
  --report-tone: #0a84ff;
  --report-tone-bg: rgba(10, 132, 255, 0.12);
}
.report-card.report-tone-1 {
  --report-tone: #af52de;
  --report-tone-bg: rgba(175, 82, 222, 0.12);
}
.report-card.report-tone-2 {
  --report-tone: #30d158;
  --report-tone-bg: rgba(48, 209, 88, 0.12);
}
.report-card.report-tone-3 {
  --report-tone: #ff9f0a;
  --report-tone-bg: rgba(255, 159, 10, 0.13);
}
.report-card.report-tone-4 {
  --report-tone: #ff375f;
  --report-tone-bg: rgba(255, 55, 95, 0.12);
}
.report-card.report-tone-5 {
  --report-tone: #64d2ff;
  --report-tone-bg: rgba(100, 210, 255, 0.13);
}
.report-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  cursor: pointer;
  background: color-mix(in srgb, var(--surface-hover) 84%, var(--report-tone-bg) 16%);
  transition: background 0.2s ease;
}
.report-card-header:hover {
  background: color-mix(in srgb, var(--surface-hover) 70%, var(--report-tone-bg) 30%);
}
.report-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
}
.report-meta svg {
  color: var(--report-tone);
}
.report-date {
  color: var(--text);
  font-size: 14px;
  font-weight: 850;
}
.report-name {
  font-family: ui-monospace, monospace;
}
.report-card-body {
  padding: 20px;
  border-top: 1px solid var(--border);
  background: var(--bg);
}
.report-card-body .minimal-pre {
  margin: 0;
  max-height: none;
  overflow: visible;
}
</style>
