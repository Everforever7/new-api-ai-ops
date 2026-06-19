<script setup>
import { ref } from 'vue'
import { Sparkles, ArrowRight, Loader2 } from 'lucide-vue-next'
import { login } from '../api.js'

const props = defineProps({
  t: { type: Function, required: true },
})

const emit = defineEmits(['loginSuccess'])

const username = ref('admin')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!username.value || !password.value) {
    error.value = props.t('login.errorEmpty') || 'Username and password required'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const authenticatedStatus = await login(username.value.trim(), password.value)
    emit('loginSuccess', authenticatedStatus)
  } catch (err) {
    error.value =
      err?.status === 401
        ? props.t('login.errorInvalid') || 'Invalid credentials'
        : err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-wrapper">
    <div class="login-bento bento-item">
      <div class="login-header">
        <div class="login-logo brand-mark">
          <Sparkles :size="24" />
        </div>
        <h2>{{ t('login.title') || 'Welcome Back' }}</h2>
        <p class="login-subtitle">{{ t('login.subtitle') || 'Sign in to access the control panel' }}</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label>{{ t('login.username') || 'Username' }}</label>
          <input 
            type="text" 
            v-model="username" 
            class="bento-input large-input" 
            autocomplete="username"
            required
            autofocus
          />
        </div>

        <div class="form-group">
          <label>{{ t('login.password') || 'Password' }}</label>
          <input 
            type="password" 
            v-model="password" 
            class="bento-input large-input" 
            autocomplete="current-password"
            required 
          />
        </div>

        <div v-if="error" class="login-error status-pill danger compact">
          <div class="status-dot"></div>
          {{ error }}
        </div>

        <button 
          type="submit" 
          class="bento-btn primary login-btn" 
          :disabled="loading"
        >
          <Loader2 v-if="loading" class="spin" :size="18" />
          <span v-else>{{ t('login.submit') || 'Sign In' }}</span>
          <ArrowRight v-if="!loading" :size="18" />
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-wrapper {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--bg);
  z-index: 10000;
  backdrop-filter: blur(10px);
}

.login-bento {
  width: 100%;
  max-width: 400px;
  padding: 40px;
  background: rgba(255, 255, 255, 0.05); /* Works for dark mode too */
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border);
  animation: float-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-logo {
  margin: 0 auto 20px;
  width: 56px;
  height: 56px;
  border-radius: 16px;
}

.login-header h2 {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.5px;
  margin-bottom: 8px;
}

.login-subtitle {
  color: var(--text-muted);
  font-size: 14px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}

.large-input {
  height: 48px;
  font-size: 15px;
  border-radius: 12px;
  padding: 0 16px;
}

.login-error {
  justify-content: center;
  margin-top: -8px;
}

.login-btn {
  height: 48px;
  margin-top: 8px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  justify-content: center;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes float-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
