import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import RookieProspector from './components/RookieProspector.jsx'
import RookieRankings from './components/RookieRankings.jsx'

const path = window.location.pathname

let Root = <App />
if (path.startsWith('/admin/rookie-prospector')) Root = <RookieProspector />
else if (path.startsWith('/rookie-rankings'))      Root = <RookieRankings />

createRoot(document.getElementById('root')).render(
  <StrictMode>{Root}</StrictMode>,
)
