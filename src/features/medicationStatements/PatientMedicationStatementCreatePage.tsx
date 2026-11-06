/** Coordinates destination-local statement authoring and returns to the source patient's Clinical Information after publication. */
import { SubmissionForm, SubmissionErrors } from '../../components/SubmissionForm'
import { PatientFormHeader } from '../../components/PatientFormHeader'
import { useEffect, useRef, useState } from 'react'
import type { Patient } from 'fhir/r4'
import { fetchPatient } from '../../lib/fhir/client'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { setRouteNotification } from '../../lib/routing/routeNotification'
import { DestinationServerField } from '../servers/DestinationServerField'
import { useSavedServers } from '../servers/useSavedServers'
import { createPatientMedicationStatement, type StatementCreationProgress } from './createMedicationStatement'
import { loadStatementCreateData, type StatementCreateData } from './statementCreateData'
import { initialStatementForm, statementFormInputs, validateStatementForm } from './statementFormModel'
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
  return <section className="panel"><PatientFormHeader title="Create Medication Statement" patient={patient}
      serverLabel={activeServer.label} serverBaseUrl={activeServer.baseUrl}
      onBack={() => navigateTo(path)} backDisabled={busy} />
    <SubmissionForm error={error} validate={() => data ? validateStatementForm(form, data) : []} onSubmit={submit}>
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
      <SubmissionErrors error={error} />
      {!loading && !data ? <button type="button" className="secondary-button" onClick={() => setReload((value) => value + 1)}>Retry loading choices</button> : null}
      {data?.warning ? <p className="warning-banner">{data.warning}</p> : null}
      {data && !data.patient ? <p className="info-banner">No matching patient was found. A Patient will be created when you submit.</p> : null}
      {data ? <><MedicationStatementForm value={form} data={data} disabled={locked || loading} onChange={setForm} />
        <button type="submit" className="primary-button toc-submit" disabled={locked || loading}>{busy ? 'Creating...' : 'Create Medication Statement'}</button></> : null}
    </SubmissionForm>
  </section>
}
