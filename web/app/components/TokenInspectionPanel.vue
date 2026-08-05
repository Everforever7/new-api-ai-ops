<script setup>
import { KeyRound, Play, ShieldAlert } from 'lucide-vue-next'

defineProps({
  result: { type: Object, default: null },
  running: { type: Boolean, default: false },
  t: { type: Function, required: true },
  formatDate: { type: Function, required: true },
})

const emit = defineEmits(['runInspection'])
</script>

<template>
  <div class="bento-grid">
    <article class="bento-item bento-hero">
      <div class="hero-content">
        <h2>{{ t('tokenInspection.title') }}</h2>
        <div class="status-pill" :class="result?.findings?.length ? 'warn' : 'ok'">
          <div class="status-dot"></div>
          {{
            result
              ? t('tokenInspection.summary', {
                  tokens: result.inspectedTokens,
                  users: result.usersFlagged,
                })
              : t('tokenInspection.notRun')
          }}
        </div>
      </div>
      <div class="hero-actions">
        <div v-if="result?.completedAt" class="last-run">
          {{ t('tokenInspection.completedAt', { value: formatDate(result.completedAt) }) }}
        </div>
        <button
          class="bento-btn primary"
          type="button"
          :disabled="running"
          @click="emit('runInspection')"
        >
          <Play :size="18" />
          <span>{{ running ? t('tokenInspection.running') : t('tokenInspection.run') }}</span>
        </button>
      </div>
    </article>

    <article class="bento-item bento-full adaptive-bento">
      <div class="bento-header">
        <div>
          <h3>{{ t('tokenInspection.findingsTitle') }}</h3>
          <p class="settings-help-text">{{ t('tokenInspection.hint') }}</p>
        </div>
        <KeyRound :size="22" />
      </div>
      <div class="bento-body">
        <div v-if="!result" class="actions-empty">
          {{ t('tokenInspection.notRunHint') }}
        </div>
        <div v-else-if="!result.findings?.length" class="actions-empty">
          {{ t('tokenInspection.empty') }}
        </div>
        <div v-else class="bento-table-wrap">
          <table class="settings-table">
            <thead>
              <tr>
                <th>{{ t('tokenInspection.user') }}</th>
                <th>{{ t('tokenInspection.tokenName') }}</th>
                <th>{{ t('tokenInspection.verdict') }}</th>
                <th>{{ t('tokenInspection.reason') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="finding in result.findings" :key="finding.tokenId">
                <td>
                  <strong>{{ finding.username }}</strong>
                  <div class="settings-help-text">#{{ finding.userId }}</div>
                </td>
                <td><code>{{ finding.tokenName }}</code></td>
                <td>
                  <span class="status-pill compact warn">
                    <ShieldAlert :size="14" />
                    {{ t(`tokenInspection.verdicts.${finding.verdict}`) }}
                  </span>
                </td>
                <td>{{ finding.violations.join('；') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </article>
  </div>
</template>
