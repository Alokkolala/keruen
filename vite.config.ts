import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { apiPlugin } from './vite-api-plugin.js'

export default defineConfig(({ mode }) => {
  // Серверные ключи не попадают в клиент — только в process.env функций.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), tailwindcss(), apiPlugin()],
    server: {
      host: true, // чтобы открыть с телефона по локальной сети
    },
  }
})
