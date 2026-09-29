/** Loads the Google tag for the deployed Pages site and queues a sanitized initial page view. */
export function initializeVisitTracking(measurementId: string | undefined) {
  if (
    !measurementId ||
    window.location.hostname !== 'paciowg.github.io' ||
    !window.location.pathname.startsWith('/pacio-explorer-reference-client/')
  ) return

  const analyticsWindow = window as Window & {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
  const dataLayer = (analyticsWindow.dataLayer ??= [])

  analyticsWindow.gtag = function (..._args: unknown[]) {
    // gtag.js recognizes native arguments objects as commands, not rest-parameter arrays.
    dataLayer.push(arguments)
  }

  analyticsWindow.gtag('js', new Date())
  // Hash routes can contain patient and document IDs; exclude them and query strings from page views.
  analyticsWindow.gtag('config', measurementId, {
    page_location: `${window.location.origin}${window.location.pathname}`,
  })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  document.head.append(script)
}
