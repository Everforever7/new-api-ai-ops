<script setup>
import { computed, nextTick, ref, onMounted, onUnmounted, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: [String, Number], required: true },
  options: { type: Array, required: true }, // Array of { value, label }
  placeholder: { type: String, default: '' },
  searchable: { type: Boolean, default: false },
  allowCustom: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'change'])

const isOpen = ref(false)
const selectRef = ref(null)
const inputRef = ref(null)
const inputValue = ref(String(props.modelValue ?? ''))
const searchQuery = ref('')

const normalizedOptions = computed(() =>
  props.options.map((option) => {
    if (option && typeof option === 'object') {
      const value = option.value
      return {
        value,
        label: option.label ?? String(value ?? ''),
      }
    }

    return {
      value: option,
      label: String(option ?? ''),
    }
  })
)

const selectedOption = computed(() =>
  normalizedOptions.value.find(
    (option) => String(option.value) === String(props.modelValue)
  )
)

const displayValue = computed(() =>
  selectedOption.value?.label || String(props.modelValue ?? '') || props.placeholder
)

const visibleOptions = computed(() => {
  if (!props.searchable) return normalizedOptions.value

  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return normalizedOptions.value

  return normalizedOptions.value.filter((option) =>
    `${option.label} ${option.value}`.toLowerCase().includes(query)
  )
})

watch(
  () => props.modelValue,
  (value) => {
    const next = String(value ?? '')
    if (next !== inputValue.value) inputValue.value = next
  }
)

function toggle() {
  const nextOpen = !isOpen.value
  isOpen.value = nextOpen
  if (nextOpen) searchQuery.value = ''
  if (isOpen.value && props.searchable) focusInput()
}

function open() {
  if (!isOpen.value) searchQuery.value = ''
  isOpen.value = true
}

function focusInput() {
  nextTick(() => {
    inputRef.value?.focus()
  })
}

function updateValue(value) {
  emit('update:modelValue', value)
  emit('change', value)
}

function selectOption(option) {
  inputValue.value = String(option.value ?? '')
  searchQuery.value = ''
  updateValue(option.value)
  isOpen.value = false
}

function handleInput(event) {
  const value = event.target.value
  inputValue.value = value
  searchQuery.value = value
  isOpen.value = true

  if (props.allowCustom) {
    updateValue(value)
  }
}

function handleClickOutside(event) {
  if (selectRef.value && !selectRef.value.contains(event.target)) {
    isOpen.value = false
    searchQuery.value = ''
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
    <button
      v-if="!searchable"
      type="button"
      class="select-trigger"
      @click="toggle"
      :class="{ open: isOpen }"
    >
      <span class="select-value">{{ displayValue }}</span>
      <ChevronDown :size="16" class="select-icon" />
    </button>
    <div
      v-else
      class="select-trigger select-trigger-input"
      :class="{ open: isOpen }"
      @click="open"
    >
      <input
        ref="inputRef"
        class="select-input"
        type="text"
        autocomplete="off"
        :placeholder="placeholder"
        :value="inputValue"
        @input="handleInput"
        @focus="open"
        @keydown.esc.prevent="isOpen = false"
      />
      <button
        type="button"
        class="select-icon-button"
        :aria-label="placeholder"
        @click.stop="toggle"
      >
        <ChevronDown :size="16" class="select-icon" />
      </button>
    </div>
    <Transition name="dropdown-fade">
      <div v-if="isOpen && visibleOptions.length" class="select-dropdown">
        <button
          v-for="option in visibleOptions"
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
