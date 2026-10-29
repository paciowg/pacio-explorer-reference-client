/** Coordinates a source-server statement amendment while preserving its original resource and returning to Clinical Information. */
import { useEffect, useRef, useState } from 'react'
import { getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import { FhirUpdateError, updateResource } from '../../lib/fhir/resourceTransport'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { setRouteNotification } from '../../lib/routing/routeNotification'
import { useSavedServers } from '../servers/useSavedServers'
import { loadStatementEditData, type StatementEditData } from './statementEditData'
import { buildStatementUpdate, hasStatementEdits, initialStatementEdit, type StatementEdit } from './statementEditModel'
import { MedicationStatementEditForm } from './MedicationStatementEditForm'

export function PatientMedicationStatementEditPage({ patientId, statementId }: { patientId: string; statementId: string }) {
  const { activeServer } = useSavedServers()
  const [data, setData] = useState<StatementEditData | null>(null)
  const [edit, setEdit] = useState<StatementEdit | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reload, setReload] = useState(0)
  const inFlight = useRef(false)
  const writeFinished = useRef(false)
  const path = `/patients/${encodeURIComponent(patientId)}?view=clinical`
  useEffect(() => {
    if (!activeServer) return
    let current = true
    setLoading(true); setData(null); setEdit(null); setError('')
    loadStatementEditData(activeServer.baseUrl, patientId, statementId).then((value) => {
      if (current) { setData(value); setEdit(initialStatementEdit(value.original)) }
    }).catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : 'Unable to load the medication statement.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [activeServer, patientId, statementId, reload])

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeServer || !data || !edit || loading || inFlight.current || writeFinished.current || !hasStatementEdits(data.original, edit)) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const updated = buildStatementUpdate(data.original, edit, new Date().toISOString())
      await updateResource(activeServer.baseUrl, updated)
      writeFinished.current = true; setSaved(true)
      setRouteNotification({ routeHref: getRouteHref(path), tone: 'success', message: `MedicationStatement updated successfully on ${activeServer.label}.` })
      navigateTo(path)
    } catch (error) {
      if (error instanceof FhirUpdateError && error.uncertain) { writeFinished.current = true; setUncertain(true) }
      setError(error instanceof Error ? error.message : 'Unable to update the medication statement.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  if (!activeServer) return null
  const locked = busy || saved || uncertain
  return <section className="panel"><div className="panel-header"><div>
    <h2>Update Medication Statement</h2>
    {data ? <p className="create-patient-name">{getDisplayNameFromHumanName(data.patient.name?.[0])}</p> : null}
  </div><div className="panel-server-details"><span className="panel-server-label">{activeServer.label}</span><span className="panel-server-url">{activeServer.baseUrl}</span></div></div>
    <div className="page-actions page-actions-spaced"><button type="button" className="secondary-button outline" disabled={busy} onClick={() => navigateTo(path)}>Back to patient</button></div>
    {loading ? <p className="info-banner" role="status">Loading medication statement...</p> : null}
    {error ? <p className="error-banner" role="alert">{error}</p> : null}
    {!loading && !data ? <button type="button" className="secondary-button" onClick={() => setReload((value) => value + 1)}>Retry loading</button> : null}
    {uncertain ? <p className="warning-banner">The update outcome is uncertain. Verify the statement on the server before starting another edit; automatic retry is disabled.</p> : null}
    {data && edit ? <form noValidate onSubmit={(event) => void submit(event)}>
      <MedicationStatementEditForm data={data} value={edit} disabled={locked} onChange={setEdit} />
      <button type="submit" className="primary-button toc-submit" disabled={locked || !hasStatementEdits(data.original, edit)}>{busy ? 'Saving...' : 'Save changes'}</button>
    </form> : null}
  </section>
}
