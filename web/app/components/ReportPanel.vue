<script setup>
const props = defineProps({
  reportText: { type: String, required: true },
  t: { type: Function, required: true }
})
</script>

<template>
  <div class="bento-grid">
    <article class="bento-item bento-full report-bento">
       <div class="bento-header">
          <h3>{{ t('report.title') }}</h3>
       </div>
       <div class="bento-body">
         <pre class="minimal-pre">{{ reportText }}</pre>
       </div>
    </article>
  </div>
</template>
