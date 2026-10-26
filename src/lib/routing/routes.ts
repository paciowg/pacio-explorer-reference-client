/** Defines, parses, and generates the application's dependency-free hash routes. */
export type PatientView = 'personal' | 'clinical' | 'documents'

export type AppRoute =
  | { name: 'home' }
  | { name: 'fhirViewer'; baseUrl: string; resourceType: string; resourceId: string }
  | { name: 'patients' }
  | { name: 'patientDetail'; patientId: string; view: PatientView }
  | { name: 'patientPmoCreate'; patientId: string }
  | { name: 'advanceDirectiveDetail'; patientId: string; documentReferenceId: string }
  | { name: 'patientTocCreate'; patientId: string }
  | { name: 'patientDeviceRequestCreate'; patientId: string }
  | { name: 'patientNutritionOrderCreate'; patientId: string }
  | { name: 'tocDetail'; patientId: string; documentReferenceId: string }
  | { name: 'smpListCreate'; patientId: string }
  | { name: 'smpListDetail'; patientId: string; resourceId: string }
  | { name: 'smpCollectionCreate'; patientId: string }
  | { name: 'smpCollectionDetail'; patientId: string; resourceId: string }

export function parseHashRoute(hash: string): AppRoute {
  const raw = hash.replace(/^#/, '') || '/'
  const [pathname, query = ''] = raw.split('?')
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  const segments = normalizedPath.split('/').filter(Boolean)

  if (segments.length === 4 && segments[0] === 'patients' && ['medication-lists', 'smp-collections'].includes(segments[2])) {
    const patientId = decodeURIComponent(segments[1])
    const list = segments[2] === 'medication-lists'
    if (segments[3] === 'new') return { name: list ? 'smpListCreate' : 'smpCollectionCreate', patientId }
    return { name: list ? 'smpListDetail' : 'smpCollectionDetail', patientId, resourceId: decodeURIComponent(segments[3]) }
  }

  if (segments.length === 3 && segments[0] === 'fhir') {
    const baseUrl = new URLSearchParams(query).get('server') || ''
    try {
      const url = new URL(baseUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return { name: 'home' }
      return { name: 'fhirViewer', baseUrl, resourceType: decodeURIComponent(segments[1]), resourceId: decodeURIComponent(segments[2]) }
    } catch { return { name: 'home' } }
  }

  if (segments.length === 0) {
    return { name: 'home' }
  }
  if (segments.length === 4 && segments[0] === 'patients' && segments[2] === 'device-requests' && segments[3] === 'new') {
    return { name: 'patientDeviceRequestCreate', patientId: decodeURIComponent(segments[1]) }
  }
  if (segments.length === 4 && segments[0] === 'patients' && segments[2] === 'nutrition-orders' && segments[3] === 'new') {
    return { name: 'patientNutritionOrderCreate', patientId: decodeURIComponent(segments[1]) }
  }

  if (segments.length === 1 && segments[0] === 'patients') {
    return { name: 'patients' }
  }

  if (
    segments.length === 4 &&
    segments[0] === 'patients' &&
    segments[2] === 'transitions-of-care' &&
    segments[3] === 'new'
  ) {
    return { name: 'patientTocCreate', patientId: decodeURIComponent(segments[1]) }
  }

  if (
    segments.length === 4 &&
    segments[0] === 'patients' &&
    segments[2] === 'transitions-of-care'
  ) {
    return {
      name: 'tocDetail',
      patientId: decodeURIComponent(segments[1]),
      documentReferenceId: decodeURIComponent(segments[3]),
    }
  }

  if (
    segments.length === 4 &&
    segments[0] === 'patients' &&
    segments[2] === 'advance-directives'
  ) {
    return {
      name: 'advanceDirectiveDetail',
      patientId: decodeURIComponent(segments[1]),
      documentReferenceId: decodeURIComponent(segments[3]),
    }
  }

  if (
    segments.length === 3 &&
    segments[0] === 'patients' &&
    segments[2] === 'pmo'
  ) {
    return { name: 'patientPmoCreate', patientId: decodeURIComponent(segments[1]) }
  }

  if (segments.length === 2 && segments[0] === 'patients') {
    const requestedView = new URLSearchParams(query).get('view')
    const view = requestedView === 'clinical' || requestedView === 'documents' ? requestedView : 'personal'
    return { name: 'patientDetail', patientId: decodeURIComponent(segments[1]), view }
  }

  return { name: 'home' }
}

export function getRouteHref(path: string) {
  return `#${path}`
}

export function navigateTo(path: string) {
  window.location.hash = path
}
