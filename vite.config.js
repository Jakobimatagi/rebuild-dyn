import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Mounts a Vercel-style /api handler as Vite dev-server middleware so client
// calls in `npm run dev` don't fall through to the SPA (or worse, get the raw
// .js source). Only used when `vercel dev` isn't running. Keep this small —
// each entry here is a per-endpoint dev shim.
function devApiHandler(routePath, importPath) {
  return {
    name: `dev-api-${routePath.replace(/\W+/g, '-')}`,
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(routePath, async (req, res) => {
        try {
          const mod  = await server.ssrLoadModule(importPath)
          const url  = new URL(req.url, 'http://x')
          const proxyRes = {
            statusCode: 200,
            _headers: {},
            status(s) { this.statusCode = s; return this },
            setHeader(k, v) { this._headers[k] = v; return this },
            json(body) {
              res.statusCode = this.statusCode
              for (const [k, v] of Object.entries(this._headers)) res.setHeader(k, v)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(body))
              return this
            },
            send(body) {
              res.statusCode = this.statusCode
              for (const [k, v] of Object.entries(this._headers)) res.setHeader(k, v)
              res.end(typeof body === 'string' ? body : JSON.stringify(body))
              return this
            },
          }
          await mod.default(
            { query: Object.fromEntries(url.searchParams), method: req.method, url: req.url },
            proxyRes,
          )
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message || String(err) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      devApiHandler('/api/historical-rosters', '/api/historical-rosters.js'),
    ],
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
