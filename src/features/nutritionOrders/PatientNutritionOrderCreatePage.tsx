/** Coordinates destination-local nutrition form loading and sequential publication while preserving created resources for retry. */
import { useEffect, useRef, useState } from 'react'
import type { Patient } from 'fhir/r4'
import { fetchPatient } from '../../lib/fhir/client'
import { getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { setRouteNotification } from '../../lib/routing/routeNotification'
import { useSavedServers } from '../servers/useSavedServers'
import { DestinationServerField } from '../servers/DestinationServerField'
import { createPatientNutritionOrder, type NutritionCreationProgress } from './createNutritionOrder'
import { loadNutritionCreateData, type NutritionCreateData } from './nutritionCreateData'
import { initialNutritionForm, nutritionFormInputs } from './nutritionFormModel'
import { NutritionOrderForm } from './NutritionOrderForm'

export function PatientNutritionOrderCreatePage({ patientId }: { patientId: string }) {
  const { activeServer, savedServers } = useSavedServers()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [destination, setDestination] = useState(activeServer?.baseUrl || '')
  const [data, setData] = useState<NutritionCreateData | null>(null)
  const [form, setForm] = useState(initialNutritionForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const progress = useRef<NutritionCreationProgress>({})
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!activeServer) return
    let current = true
    setPatient(null)
    setLoading(true)
    setError('')
    fetchPatient(activeServer.baseUrl, patientId).then((patient) => { if (current) setPatient(patient) }).catch((error) => {
      if (current) { setError(error instanceof Error ? error.message : 'Unable to load patient.'); setLoading(false) }
    })
    return () => { current = false }
  }, [activeServer, patientId, reload])

  useEffect(() => {
    if (!patient || !activeServer || !destination) return
    let current = true
    setLoading(true)
    setData(null)
    setError('')
    loadNutritionCreateData(activeServer.baseUrl, destination, patient).then((data) => { if (current) setData(data) }).catch((error) => {
      if (current) setError(error instanceof Error ? error.message : 'Unable to load destination choices.')
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [patient, activeServer, destination])

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patient || !data || !activeServer || loading || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    try {
      const input = nutritionFormInputs(form, data.options)
      await createPatientNutritionOrder({ ...input, patient, sourceBaseUrl: activeServer.baseUrl, destinationBaseUrl: destination, recordedAt: new Date().toISOString() }, progress.current)
      const label = savedServers.find((server) => server.baseUrl === destination)?.label || destination
      setRouteNotification({ routeHref: getRouteHref(`/patients/${patientId}`), tone: 'success', message: `NutritionOrder created successfully on ${label}.` })
      navigateTo(`/patients/${patientId}`)
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to create the nutrition order.') }
    finally { submittingRef.current = false; setSubmitting(false) }
  }

  if (!activeServer) return null
  const referenceLocked = Boolean(progress.current.patientCreated || progress.current.allergies || progress.current.createdAllergy)
  return <section className="panel"><div className="panel-header"><h2>Create Nutrition Order</h2><div className="panel-server-details"><span className="panel-server-label">{activeServer.label}</span><span className="panel-server-url">{activeServer.baseUrl}</span></div></div>
    <div className="pmo-form-panel full-width-panel"><div className="page-actions page-actions-spaced"><button type="button" className="secondary-button outline" disabled={submitting} onClick={() => navigateTo(`/patients/${patientId}`)}>Back to patient</button></div>
      {patient ? <p className="patient-summary-name">{getDisplayNameFromHumanName(patient.name?.[0])}</p> : null}
      <form noValidate onSubmit={(event) => void submit(event)}>
        <DestinationServerField id="nutrition-destination" servers={savedServers} value={destination} disabled={submitting || referenceLocked || Boolean(progress.current.uncertain)} resourceDescription="NutritionOrder and, if needed, a no-known-food-allergy record" onChange={(destination) => {
          progress.current = {}
          setData(null)
          setLoading(true)
          setDestination(destination)
          setForm((form) => ({ ...form, encounter: '', orderer: '', allergies: [], allergyMode: '' }))
        }} />
        {loading ? <p className="info-banner">Loading destination nutrition choices...</p> : null}
        {error ? <p className="error-banner" role="alert">{error}</p> : null}
        {!loading && !data ? <button type="button" className="secondary-button" onClick={() => setReload((value) => value + 1)}>Retry loading choices</button> : null}
        {data?.warning ? <p className="warning-banner">{data.warning}</p> : null}
        {data && !data.patient ? <p className="info-banner">No matching patient was found. A Patient will be created when you submit.</p> : null}
        {data ? <><NutritionOrderForm value={form} options={data.options} disabled={submitting || loading || Boolean(progress.current.uncertain)} allergyLocked={referenceLocked} onChange={setForm} />
          <button type="submit" className="primary-button toc-submit" disabled={submitting || loading || Boolean(progress.current.uncertain)}>{submitting ? 'Creating...' : progress.current.allergies ? 'Retry NutritionOrder creation' : 'Create Nutrition Order'}</button></> : null}
      </form>
    </div>
  </section>
}
