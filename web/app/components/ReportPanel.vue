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
             v-for="report in reports" 
             :key="report.name" 
             class="report-card" 
             :class="{ expanded: expandedIds.has(report.name) }"
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
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  overflow: hidden;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.report-card:hover {
  border-color: var(--primary);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}
.report-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  cursor: pointer;
  background: var(--surface-hover);
  transition: background 0.2s ease;
}
.report-card-header:hover {
  background: color-mix(in srgb, var(--surface-hover) 80%, var(--primary) 20%);
}
.report-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
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
