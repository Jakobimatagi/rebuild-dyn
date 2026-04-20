import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/sleeper': {
          target: 'https://api.sleeper.app/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/sleeper/, ''),
        },
        '/fleaflicker': {
          target: 'https://www.fleaflicker.com/api',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/fleaflicker/, ''),
        },
        '/rosteraudit': {
          target: 'https://rosteraudit.com/wp-json/ra/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rosteraudit/, ''),
        },
        '/api/cfbd': {
          target: 'https://api.collegefootballdata.com',
          changeOrigin: true,
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const url = new URL(req.url, 'http://x')
              const cfbdPath = url.searchParams.get('path') || ''
              url.searchParams.delete('path')
              proxyReq.path = `/${cfbdPath}${url.search}`
              if (env.VITE_CFBD_API_KEY) {
                proxyReq.setHeader('Authorization', `Bearer ${env.VITE_CFBD_API_KEY}`)
              }
            })
          },
        },
      },
    },
  }
})
