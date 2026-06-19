<script setup>
const props = defineProps({
  reportText: { type: String, required: true },
  t: { type: Function, required: true }
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
       <div class="bento-body">
         <pre class="minimal-pre">{{ reportText }}</pre>
       </div>
    </article>
  </div>
</template>
