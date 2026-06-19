import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const webRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, repoRoot, ''),
    ...process.env,
  }
  const panelPort = Number(env.PANEL_PORT || 8787)
  const webPort = Number(env.WEB_PORT || 5173)
  const webHost = env.WEB_HOST || '127.0.0.1'
  const panelUsername = env.PANEL_USERNAME || 'admin'
  const panelPassword = env.PANEL_PASSWORD
  const proxyHeaders = panelPassword
    ? {
        Authorization: `Basic ${Buffer.from(`${panelUsername}:${panelPassword}`).toString(
          'base64'
        )}`,
      }
    : undefined

  return {
    root: webRoot,
    plugins: [vue()],
    server: {
      host: webHost,
      port: webPort,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${panelPort}`,
          changeOrigin: true,
          headers: proxyHeaders,
        },
        '/healthz': {
          target: `http://127.0.0.1:${panelPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
