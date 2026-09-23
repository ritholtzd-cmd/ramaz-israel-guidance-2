import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AdminApp from './AdminApp.jsx'
import CancelApp from './CancelApp.jsx'

// Tiny path-based router: /admin → staff admin, /cancel → self-service
// cancellation (link from the confirmation email), everything else → booking.
const path = window.location.pathname.replace(/\/+$/, '')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {path === '/admin' ? <AdminApp /> : path === '/cancel' ? <CancelApp /> : <App />}
  </StrictMode>,
)
