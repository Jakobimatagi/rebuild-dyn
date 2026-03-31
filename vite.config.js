import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/sleeper': {
        target: 'https://api.sleeper.app/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sleeper/, ''),
      },
    },
  },
})
