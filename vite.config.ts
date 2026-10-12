import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves the site from /<repo>/. Override with VITE_BASE_PATH=/ for a custom domain.
const base = process.env.VITE_BASE_PATH ?? '/english-words-trainer/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  // The voice model runs in a worker. Prepared up front, so the dev server does not reload the page on the first voicing.
  optimizeDeps: { include: ['kokoro-js'] },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
