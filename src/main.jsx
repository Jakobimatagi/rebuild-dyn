import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initAnalytics } from './lib/analytics.js'
import { Analytics } from '@vercel/analytics/react'

// Admin/standalone roots are lazy so their code never ships to regular
// visitors — App stays eager because it's the default path.
const RookieProspector      = lazy(() => import('./components/RookieProspector.jsx'))
const RookieRankings        = lazy(() => import('./components/RookieRankings.jsx'))
const OffensiveCoordinators = lazy(() => import('./components/OffensiveCoordinators.jsx'))
const AdminTopPlayers       = lazy(() => import('./components/AdminTopPlayers.jsx'))
const AdminHotStreaks       = lazy(() => import('./components/AdminHotStreaks.jsx'))
const AdminUsers            = lazy(() => import('./components/AdminUsers.jsx'))
const AdminDeepDiveCards    = lazy(() => import('./components/AdminDeepDiveCards.jsx'))

initAnalytics()

const path = window.location.pathname

let Root = <App />
if (path.startsWith('/admin/rookie-prospector')) Root = <RookieProspector />
else if (path.startsWith('/admin/oc-rankings'))   Root = <OffensiveCoordinators />
else if (path.startsWith('/admin/top-players'))   Root = <AdminTopPlayers />
else if (path.startsWith('/admin/hot-streaks'))   Root = <AdminHotStreaks />
else if (path.startsWith('/admin/users'))         Root = <AdminUsers />
else if (path.startsWith('/admin/deep-dive-cards')) Root = <AdminDeepDiveCards />
else if (path.startsWith('/rookie-rankings'))      Root = <RookieRankings />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={<div className="dyn-spinner" aria-label="Loading" />}>
      {Root}
    </Suspense>
    <Analytics />
  </StrictMode>,
)
