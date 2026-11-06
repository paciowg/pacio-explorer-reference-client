/** Coordinates identity-preserving live List updates on the active server and returns users to the patient's Documents tab. */
import { SubmissionForm, SubmissionErrors, ValidationField } from '../../components/SubmissionForm'
import { PatientFormHeader } from '../../components/PatientFormHeader'
import { useEffect, useRef, useState } from 'react'
import { TransferList } from '../../components/TransferList'
import { FhirUpdateError, updateResource } from '../../lib/fhir/resourceTransport'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { setRouteNotification } from '../../lib/routing/routeNotification'
import { useSavedServers } from '../servers/useSavedServers'
import { loadSmpListEditData, type SmpListEditData } from './smpListEditData'
import { buildSmpListUpdate, hasSmpListEdits, initialSmpListEdit, type SmpListEdit, validateSmpListEdit } from './smpListEditModel'
import { SmpListEmptyReason, SmpListFields } from './SmpListFields'

export function SmpListEditPage({ patientId, resourceId }: { patientId: string; resourceId: string }) {
  const { activeServer } = useSavedServers()
  const [data, setData] = useState<SmpListEditData | null>(null)
  const [edit, setEdit] = useState<SmpListEdit | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reload, setReload] = useState(0)
  const inFlight = useRef(false)
  const writeFinished = useRef(false)
  const path = `/patients/${encodeURIComponent(patientId)}?view=documents`
  useEffect(() => {
    if (!activeServer) return
    let current = true
    setLoading(true); setData(null); setEdit(null); setError('')
    loadSmpListEditData(activeServer.baseUrl, patientId, resourceId).then((value) => {
      if (current) { setData(value); setEdit(initialSmpListEdit(value.original)) }
    }).catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : 'Unable to load the medication List.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [activeServer, patientId, resourceId, reload])

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeServer || !data || !edit || loading || inFlight.current || writeFinished.current || !hasSmpListEdits(data.original, edit)) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const updated = buildSmpListUpdate(data.original, edit, data.choices, activeServer.baseUrl, patientId, new Date().toISOString())
      await updateResource(activeServer.baseUrl, updated)
      writeFinished.current = true; setSaved(true)
      setRouteNotification({ routeHref: getRouteHref(path), tone: 'success', message: `Medication List updated successfully on ${activeServer.label}.` })
      navigateTo(path)
    } catch (error) {
      if (error instanceof FhirUpdateError && error.uncertain) { writeFinished.current = true; setUncertain(true) }
      setError(error instanceof Error ? error.message : 'Unable to update the medication List.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  if (!activeServer) return null
  const locked = busy || saved || uncertain
  const change = (patch: Partial<SmpListEdit>) => setEdit((value) => value ? { ...value, ...patch } : value)
  return <section className="panel"><PatientFormHeader title="Edit Medication List" patient={data?.choices.patient}
      serverLabel={activeServer.label} serverBaseUrl={activeServer.baseUrl}
      onBack={() => navigateTo(path)} backDisabled={busy} />
    <div className="smp-page">
      {loading ? <p role="status">Loading medication List…</p> : null}
      {!data && error ? <p className="error-banner" role="alert">{error}</p> : null}
      {!loading && !data ? <button type="button" className="secondary-button" onClick={() => setReload((value) => value + 1)}>Retry loading</button> : null}
      {uncertain ? <p className="warning-banner">The update outcome is uncertain. Verify the List on the server before starting another edit; automatic retry is disabled.</p> : null}
      {data && edit ? <SubmissionForm error={error} checkConstraints={false} validate={() => data && edit && activeServer ? validateSmpListEdit(data.original, edit, data.choices, activeServer.baseUrl, patientId) : []} onSubmit={submit}><SubmissionErrors error={error} /><fieldset disabled={locked}>
        <ValidationField field="smp-title" className="field-group"><label htmlFor="smp-title">Title</label><input id="smp-title" required value={edit.title} onChange={(event) => change({ title: event.target.value })} /></ValidationField>
        <SmpListFields value={edit} authors={data.choices.authors} original={data.original} onChange={change} />
        <TransferList label="Medication statements" showDates disabled={locked} values={edit.selected} options={data.memberOptions}
          onChange={(selected) => change({ selected, emptyReason: selected.length ? '' : edit.emptyReason })} />
        {!edit.selected.length ? <SmpListEmptyReason value={edit.emptyReason} original={data.original} onChange={(emptyReason) => change({ emptyReason })} /> : null}
      </fieldset><button type="submit" className="primary-button" disabled={locked || !hasSmpListEdits(data.original, edit)}>{busy ? 'Saving…' : 'Save changes'}</button></SubmissionForm> : null}
    </div>
  </section>
}
