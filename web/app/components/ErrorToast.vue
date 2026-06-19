<script setup>
import { AlertCircle, X } from 'lucide-vue-next'

defineProps({
  toasts: { type: Array, required: true },
  t: { type: Function, required: true },
})

const emit = defineEmits(['dismiss'])
</script>

<template>
  <Teleport to="body">
    <div class="toast-region" aria-live="assertive" aria-atomic="false">
      <TransitionGroup name="toast-slide">
        <article
          v-for="toast in toasts"
          :key="toast.id"
          class="error-toast"
          role="alert"
        >
          <div class="error-toast-icon">
            <AlertCircle :size="20" />
          </div>
          <div class="error-toast-copy">
            <div class="error-toast-title">{{ toast.title }}</div>
            <p>{{ toast.message }}</p>
          </div>
          <button
            class="error-toast-close"
            type="button"
            :aria-label="t('errors.dismiss')"
            :title="t('errors.dismiss')"
            @click="emit('dismiss', toast.id)"
          >
            <X :size="16" />
          </button>
        </article>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
