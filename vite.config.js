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
          // Read + JSON-parse the body for POST handlers (Vercel does this in
          // prod; the dev shim must mimic it). GET/HEAD carry no body.
          let body
          if (req.method && !['GET', 'HEAD'].includes(req.method)) {
            body = await new Promise((resolve) => {
              let raw = ''
              req.on('data', (c) => { raw += c })
              req.on('end', () => {
                try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve(raw) }
              })
            })
          }
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
            { query: Object.fromEntries(url.searchParams), method: req.method, url: req.url, headers: req.headers, body },
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
  // Vite only exposes VITE_* vars to the client. The dev /api shims run in Node
  // and read server-only secrets (e.g. CFBD_KEY) from process.env, which Vite
  // doesn't populate — so mirror non-VITE keys from .env.local into process.env
  // for `npm run dev`. In production these come from the Vercel project env.
  const env = loadEnv(mode, process.cwd(), '')
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith('VITE_') && process.env[k] === undefined) process.env[k] = v
  }

  return {
    build: {
      rollupOptions: {
        output: {
          // Stable vendor chunks so app-code changes don't bust the cache on
          // the big third-party deps (and vice versa).
          manualChunks: {
            react:    ['react', 'react-dom'],
            supabase: ['@supabase/supabase-js'],
            posthog:  ['posthog-js'],
          },
        },
      },
    },
    plugins: [
      react(),
      devApiHandler('/api/historical-rosters', '/api/historical-rosters.js'),
      devApiHandler('/api/cfbd', '/api/cfbd.js'),
      devApiHandler('/api/sleeper-auth', '/api/sleeper-auth.js'),
      devApiHandler('/api/admin-users', '/api/admin-users.js'),
    ],
    server: {
      proxy: {
        // Per-week projections + box scores live on the newer host (no /v1).
        // Must precede '/sleeper' — Vite matches the first prefix that fits and
        // '/sleeper' is itself a prefix of '/sleeper2'.
        '/sleeper2': {
          target: 'https://api.sleeper.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/sleeper2/, ''),
        },
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
      },
    },
  }
})
