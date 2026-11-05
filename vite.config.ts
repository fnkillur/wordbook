import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  base: mode === 'web' ? (process.env.PAGES_BASE ?? '/wordbook/') : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    env: { TZ: 'Asia/Seoul' },
  },
}))
