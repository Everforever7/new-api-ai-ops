<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: [String, Number], required: true },
  options: { type: Array, required: true } // Array of { value, label }
})

const emit = defineEmits(['update:modelValue', 'change'])

const isOpen = ref(false)
const selectRef = ref(null)

function toggle() {
  isOpen.value = !isOpen.value
}

function selectOption(option) {
  emit('update:modelValue', option.value)
  emit('change', option.value)
  isOpen.value = false
}

function handleClickOutside(event) {
  if (selectRef.value && !selectRef.value.contains(event.target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="custom-select" ref="selectRef">
    <button type="button" class="select-trigger" @click="toggle" :class="{ open: isOpen }">
      <span>{{ options.find(o => o.value === modelValue)?.label || modelValue }}</span>
      <ChevronDown :size="16" class="select-icon" />
    </button>
    <Transition name="dropdown-fade">
      <div v-if="isOpen" class="select-dropdown">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="select-option"
          :class="{ active: option.value === modelValue }"
          @click="selectOption(option)"
        >
          {{ option.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>
