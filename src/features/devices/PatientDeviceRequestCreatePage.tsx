/** Coordinates destination selection, read-only reference loading, and submission of a patient PFE device request. */
import { useEffect, useRef, useState } from 'react'
import type { Patient } from 'fhir/r4'
import { fetchPatient } from '../../lib/fhir/client'
import { getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { setRouteNotification } from '../../lib/routing/routeNotification'
import { useSavedServers } from '../servers/useSavedServers'
import { DestinationServerField } from '../servers/DestinationServerField'
import { createPatientDeviceRequest, type DeviceCreationProgress } from './createDeviceRequest'
import { loadDeviceCreateData, type DeviceCreateData } from './deviceCreateData'
import { deviceFormInputs, initialDeviceForm } from './deviceFormModel'
import { DeviceRequestForm } from './DeviceRequestForm'

export function PatientDeviceRequestCreatePage({ patientId }: { patientId: string }) {
  const { activeServer, savedServers } = useSavedServers()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [destination, setDestination] = useState(activeServer?.baseUrl || '')
  const [data, setData] = useState<DeviceCreateData | null>(null)
  const [form, setForm] = useState(initialDeviceForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const progress = useRef<DeviceCreationProgress>({})
  const submittingRef = useRef(false)
  useEffect(() => {
    if (!activeServer) return
    let current = true
    setPatient(null)
    setError('')
    fetchPatient(activeServer.baseUrl, patientId).then((patient) => { if (current) setPatient(patient) }).catch((error) => { if (current) { setError(error instanceof Error ? error.message : 'Unable to load patient.'); setLoading(false) } })
    return () => { current = false }
  }, [activeServer, patientId])
  useEffect(() => {
    if (!patient || !activeServer || !destination) return
    let current = true
    setLoading(true)
    setData(null)
    setError('')
    loadDeviceCreateData(activeServer.baseUrl, destination, patient).then((data) => { if (current) setData(data) }).catch((error) => { if (current) setError(error instanceof Error ? error.message : 'Unable to load destination choices.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [patient, activeServer, destination, reload])

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patient || !data || !activeServer || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    try {
      const input = deviceFormInputs(form, data.options)
      await createPatientDeviceRequest({ ...input, patient, sourceBaseUrl: activeServer.baseUrl, destinationBaseUrl: destination }, progress.current)
      const label = savedServers.find((server) => server.baseUrl === destination)?.label || destination
      setRouteNotification({ routeHref: getRouteHref(`/patients/${patientId}?view=clinical`), tone: 'success', message: `Device and DeviceRequest created successfully on ${label}.` })
      navigateTo(`/patients/${patientId}?view=clinical`)
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to create the device request.') }
    finally { submittingRef.current = false; setSubmitting(false) }
  }
  if (!activeServer) return null
  return <section className="panel"><div className="panel-header"><div>
          <h2>Create Device Request</h2>
          {patient ? <p className="create-patient-name">{getDisplayNameFromHumanName(patient.name?.[0])}</p> : null}
        </div><div className="panel-server-details"><span className="panel-server-label">{activeServer.label}</span><span className="panel-server-url">{activeServer.baseUrl}</span></div></div>
    <><div className="page-actions page-actions-spaced"><button type="button" disabled={submitting} className="secondary-button outline" onClick={() => navigateTo(`/patients/${patientId}?view=clinical`)}>Back to patient</button></div>
      <form noValidate onSubmit={(event) => void submit(event)}>
        <DestinationServerField id="device-destination" servers={savedServers} value={destination} disabled={submitting || Boolean(progress.current.patient) || Boolean(progress.current.uncertain)} resourceDescription="Device and DeviceRequest" onChange={(value) => {
          setDestination(value)
          setForm((form) => ({ ...form, owner: '', requester: '', encounter: '', users: [], priorRequests: [], insurance: [], assessments: [], goals: [], reasonReferences: [] }))
        }} />
        {loading ? <p className="info-banner">Loading destination reference choices...</p> : null}
        {error ? <p className="error-banner" role="alert">{error}</p> : null}
        {!loading && !data && patient ? <button type="button" className="secondary-button" onClick={() => setReload((value) => value + 1)}>Retry loading choices</button> : null}
        {data?.warning ? <p className="warning-banner">{data.warning}</p> : null}
        {data && !data.patient ? <p className="info-banner">No matching patient was found. A Patient will be created when you submit.</p> : null}
        {data ? <><DeviceRequestForm value={form} options={data.options} disabled={submitting || loading || Boolean(progress.current.uncertain)} deviceLocked={Boolean(progress.current.device)} onChange={setForm} />
          <button type="submit" className="primary-button toc-submit" disabled={submitting || loading || Boolean(progress.current.uncertain)}>{submitting ? 'Creating...' : progress.current.device ? 'Retry DeviceRequest creation' : 'Create Device Request'}</button></> : null}
      </form>
    </>
  </section>
}
