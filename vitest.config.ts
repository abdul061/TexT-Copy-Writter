import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Separate config so the Vite build config stays free of test-only options.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
