import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import RookieProspector from './components/RookieProspector.jsx'
import RookieRankings from './components/RookieRankings.jsx'
import OffensiveCoordinators from './components/OffensiveCoordinators.jsx'
import AdminTopPlayers from './components/AdminTopPlayers.jsx'
import AdminHotStreaks from './components/AdminHotStreaks.jsx'
import AdminUsers from './components/AdminUsers.jsx'
import { initAnalytics } from './lib/analytics.js'
import { Analytics } from '@vercel/analytics/react'

initAnalytics()

const path = window.location.pathname

let Root = <App />
if (path.startsWith('/admin/rookie-prospector')) Root = <RookieProspector />
else if (path.startsWith('/admin/oc-rankings'))   Root = <OffensiveCoordinators />
else if (path.startsWith('/admin/top-players'))   Root = <AdminTopPlayers />
else if (path.startsWith('/admin/hot-streaks'))   Root = <AdminHotStreaks />
else if (path.startsWith('/admin/users'))         Root = <AdminUsers />
else if (path.startsWith('/rookie-rankings'))      Root = <RookieRankings />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {Root}
    <Analytics />
  </StrictMode>,
)
