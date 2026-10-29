/** Coordinates destination-local statement authoring and returns to the source patient's Clinical Information after publication. */
import { useEffect, useRef, useState } from 'react'
import type { Patient } from 'fhir/r4'
import { fetchPatient } from '../../lib/fhir/client'
import { getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { setRouteNotification } from '../../lib/routing/routeNotification'
import { DestinationServerField } from '../servers/DestinationServerField'
import { useSavedServers } from '../servers/useSavedServers'
import { createPatientMedicationStatement, type StatementCreationProgress } from './createMedicationStatement'
import { loadStatementCreateData, type StatementCreateData } from './statementCreateData'
import { initialStatementForm, statementFormInputs } from './statementFormModel'
import { MedicationStatementForm } from './MedicationStatementForm'

export function PatientMedicationStatementCreatePage({ patientId }: { patientId: string }) {
  const { activeServer, savedServers } = useSavedServers()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [destination, setDestination] = useState(activeServer?.baseUrl || '')
  const [data, setData] = useState<StatementCreateData | null>(null)
  const [form, setForm] = useState(initialStatementForm)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const progress = useRef<StatementCreationProgress>({})
  const inFlight = useRef(false)
  const path = `/patients/${encodeURIComponent(patientId)}?view=clinical`

  useEffect(() => {
    if (!activeServer) return
    let current = true
    fetchPatient(activeServer.baseUrl, patientId).then((value) => { if (current) setPatient(value) })
      .catch((error: unknown) => { if (current) { setError(error instanceof Error ? error.message : 'Unable to load patient.'); setLoading(false) } })
    return () => { current = false }
  }, [activeServer, patientId, reload])
  useEffect(() => {
    if (!activeServer || !patient || !destination) return
    let current = true
    setLoading(true)
    setData(null)
    setError('')
    loadStatementCreateData(activeServer.baseUrl, destination, patient)
      .then((value) => { if (current) setData(value) })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : 'Unable to load destination choices.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [activeServer, patient, destination, reload])

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patient || !data || !activeServer || loading || inFlight.current || progress.current.uncertain || progress.current.statement) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      await createPatientMedicationStatement({ sourceBaseUrl: activeServer.baseUrl, destinationBaseUrl: destination, patient, data,
        statement: statementFormInputs(form, data) }, progress.current)
      const label = savedServers.find((server) => server.baseUrl === destination)?.label || destination
      setRouteNotification({ routeHref: getRouteHref(path), tone: 'success', message: `MedicationStatement created successfully on ${label}.` })
      navigateTo(path)
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to create the medication statement.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  if (!activeServer) return null
  const locked = busy || Boolean(progress.current.uncertain || progress.current.statement)
  return <section className="panel"><div className="panel-header"><div>
    <h2>Create Medication Statement</h2>
    {patient ? <p className="create-patient-name">{getDisplayNameFromHumanName(patient.name?.[0])}</p> : null}
  </div><div className="panel-server-details"><span className="panel-server-label">{activeServer.label}</span><span className="panel-server-url">{activeServer.baseUrl}</span></div></div>
    <div className="page-actions page-actions-spaced"><button type="button" className="secondary-button outline" disabled={busy} onClick={() => navigateTo(path)}>Back to patient</button></div>
    <form noValidate onSubmit={(event) => void submit(event)}>
      <DestinationServerField id="statement-destination" servers={savedServers} value={destination} disabled={locked || Boolean(progress.current.patient)} resourceDescription="MedicationStatement" onChange={(value) => {
        setDestination(value)
        setData(null)
        setLoading(true)
        setError('')
        // Keep manually entered non-reference values; discard copied or destination-specific clinical inputs.
        setForm((previous) => ({ ...previous, basedOn: '', medication: previous.basedOn || previous.medication.medicationReference ? {} : previous.medication,
          dosage: previous.basedOn ? [] : previous.dosage, informationSource: '', context: '', reasonReferences: [] }))
      }} />
      {loading ? <p className="info-banner" role="status">Loading destination reference choices...</p> : null}
      {error ? <p className="error-banner" role="alert">{error}</p> : null}
      {!loading && !data ? <button type="button" className="secondary-button" onClick={() => setReload((value) => value + 1)}>Retry loading choices</button> : null}
      {data?.warning ? <p className="warning-banner">{data.warning}</p> : null}
      {data && !data.patient ? <p className="info-banner">No matching patient was found. A Patient will be created when you submit.</p> : null}
      {data ? <><MedicationStatementForm value={form} data={data} disabled={locked || loading} onChange={setForm} />
        <button type="submit" className="primary-button toc-submit" disabled={locked || loading}>{busy ? 'Creating...' : 'Create Medication Statement'}</button></> : null}
    </form>
  </section>
}
