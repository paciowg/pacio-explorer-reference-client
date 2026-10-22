/** Selects the page for the current hash route and carries route-level notifications between pages. */
import { useEffect, useState } from 'react'
import './App.css'
import { useHashRoute } from './lib/routing/useHashRoute'
import { getRouteHref, navigateTo } from './lib/routing/routes'
import { AppLayout } from './components/AppLayout'
import { ServerConnectPage } from './features/servers/ServerConnectPage'
import { PatientListPage } from './features/patients/PatientListPage'
import { PatientSummaryPage } from './features/patientSummary/PatientSummaryPage'
import { FhirViewerPage } from './features/fhirViewer/FhirViewerPage'
import { PatientPmoCreatePage } from './features/advanceDirectives/PatientPmoCreatePage'
import { AdvanceDirectiveDetailPage } from './features/advanceDirectives/AdvanceDirectiveDetailPage'
import { PatientTocCreatePage } from './features/transitionsOfCare/PatientTocCreatePage'
import { TocDetailPage } from './features/transitionsOfCare/TocDetailPage'
import { PatientDeviceRequestCreatePage } from './features/devices/PatientDeviceRequestCreatePage'
import { PatientNutritionOrderCreatePage } from './features/nutritionOrders/PatientNutritionOrderCreatePage'
import { useSavedServers } from './features/servers/useSavedServers'
import {
  clearRouteNotification,
  getRouteNotification,
  type RouteNotification,
} from './lib/routing/routeNotification'

function App() {
  const route = useHashRoute()
  const { activeServer } = useSavedServers()
  const [notification, setNotification] = useState<RouteNotification | null>(() =>
    getRouteNotification(),
  )

  useEffect(() => {
    setNotification(getRouteNotification())
  }, [route])

  useEffect(() => {
    if (activeServer && route.name === 'home') {
      navigateTo('/patients')
      return
    }

    if (!activeServer && route.name !== 'home' && route.name !== 'fhirViewer') {
      navigateTo('/')
    }
  }, [activeServer, route])

  useEffect(() => {
    if (!notification) return

    const currentHref = getRouteHref(window.location.hash.replace(/^#/, '') || '/')
    if (currentHref !== notification.routeHref) {
      clearRouteNotification()
      setNotification(null)
    }
  }, [notification, route])

  return (
    <AppLayout notification={notification}>
      {route.name === 'home' ? <ServerConnectPage /> : null}
      {route.name === 'patients' ? <PatientListPage /> : null}
      {route.name === 'fhirViewer' ? <FhirViewerPage baseUrl={route.baseUrl} resourceType={route.resourceType} resourceId={route.resourceId} /> : null}
      {route.name === 'patientDetail' ? (
        <PatientSummaryPage key={`${activeServer?.baseUrl}:${route.patientId}`} patientId={route.patientId} view={route.view} />
      ) : null}
      {route.name === 'patientPmoCreate' ? (
        <PatientPmoCreatePage patientId={route.patientId} />
      ) : null}
      {route.name === 'advanceDirectiveDetail' ? (
        <AdvanceDirectiveDetailPage
          patientId={route.patientId}
          documentReferenceId={route.documentReferenceId}
        />
      ) : null}
      {route.name === 'patientTocCreate' ? (
        <PatientTocCreatePage patientId={route.patientId} />
      ) : null}
      {route.name === 'patientDeviceRequestCreate' ? <PatientDeviceRequestCreatePage key={`${activeServer?.baseUrl}:${route.patientId}`} patientId={route.patientId} /> : null}
      {route.name === 'patientNutritionOrderCreate' ? <PatientNutritionOrderCreatePage key={`${activeServer?.baseUrl}:${route.patientId}`} patientId={route.patientId} /> : null}
      {route.name === 'tocDetail' ? (
        <TocDetailPage patientId={route.patientId} documentReferenceId={route.documentReferenceId} />
      ) : null}
    </AppLayout>
  )
}

export default App
