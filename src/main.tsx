/** Initializes Pages-only visit tracking and mounts the React application with saved-server state. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SavedServersProvider } from './features/servers/SavedServersProvider.tsx'
import { initializeVisitTracking } from './lib/analytics'

initializeVisitTracking(import.meta.env.VITE_GA_MEASUREMENT_ID)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SavedServersProvider>
      <App />
    </SavedServersProvider>
  </StrictMode>,
)
