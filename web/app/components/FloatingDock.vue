<script setup>
import { Languages, Moon, Sun } from 'lucide-vue-next'

const props = defineProps({
  tabs: { type: Array, required: true },
  activeTab: { type: String, required: true },
  locale: { type: String, required: true },
  theme: { type: String, required: true },
  themeToggleLabel: { type: String, required: true }
})

const emit = defineEmits(['update:activeTab', 'cycleLocale', 'toggleTheme'])
</script>

<template>
  <nav class="floating-dock">
    <div class="dock-container">
      <!-- Main Nav -->
      <div class="dock-group">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          class="dock-item"
          :class="{ active: activeTab === tab.id }"
          @click="emit('update:activeTab', tab.id)"
          :title="tab.label"
        >
          <component :is="tab.icon" :size="22" />
          <span class="dock-tooltip">{{ tab.label }}</span>
          <div v-if="activeTab === tab.id" class="dock-indicator"></div>
        </button>
      </div>

      <div class="dock-divider"></div>

      <!-- Preferences -->
      <div class="dock-group">
         <button class="dock-item" @click="emit('cycleLocale')" title="Switch Language">
           <Languages :size="22" />
           <span class="dock-tooltip">{{ locale.toUpperCase() }}</span>
         </button>
         <button class="dock-item" @click="emit('toggleTheme')" :title="themeToggleLabel">
           <Sun v-if="theme === 'dark'" :size="22" />
           <Moon v-else :size="22" />
           <span class="dock-tooltip">{{ theme === 'dark' ? 'Light' : 'Dark' }}</span>
         </button>
      </div>
    </div>
  </nav>
</template>
