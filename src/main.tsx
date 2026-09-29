/** Initializes Pages-only visit tracking and mounts the React application with saved-server state. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SavedServersProvider } from './features/servers/SavedServersProvider.tsx'

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID

if (
  measurementId &&
  window.location.hostname === 'paciowg.github.io' &&
  window.location.pathname.startsWith('/pacio-explorer-reference-client/')
) {
  const analyticsWindow = window as Window & { dataLayer?: unknown[][] }
  const dataLayer = (analyticsWindow.dataLayer ??= [])
  const gtag = (...args: unknown[]) => dataLayer.push(args)

  gtag('js', new Date())
  // Hash routes can contain patient and document IDs; exclude them and query strings from page views.
  gtag('config', measurementId, {
    page_location: `${window.location.origin}${window.location.pathname}`,
  })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  document.head.append(script)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SavedServersProvider>
      <App />
    </SavedServersProvider>
  </StrictMode>,
)
