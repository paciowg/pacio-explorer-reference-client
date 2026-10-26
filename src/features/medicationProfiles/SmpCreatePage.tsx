/** Coordinates source List authoring and reviewed collection publication with in-session recovery state. */
import { useEffect, useRef, useState } from 'react'
import type { List } from 'fhir/r4'
import { EMPTY_REASONS, LIST_TYPES, uuidIdentifier } from '../../igs/pacioSmp/smp'
import { TransferList } from '../../components/TransferList'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { getResourceTransferChoices } from '../../lib/fhir/resourceOptions'
import { getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import { localDateInputValue } from '../../lib/dateTime'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { setRouteNotification } from '../../lib/routing/routeNotification'
import { DestinationServerField } from '../servers/DestinationServerField'
import { useSavedServers } from '../servers/useSavedServers'
import { loadSmpChoices, type SmpChoices } from './smpData'
import { prepareSmpSnapshot, SmpSourceChangedError, type PreparedSnapshot } from './smpReferences'
import { matchSmpPatient, publishSmpCollection, type DestinationMatch, type SmpProgress } from './smpPublishing'
import { saveSmpMedicationList, type SmpListSaveProgress } from './smpListCreation'
import { SmpListContent } from './SmpListContent'

type Review = { snapshot: PreparedSnapshot; match: DestinationMatch; title: string; destination: string }

export function SmpCreatePage({ patientId, kind }: { patientId: string; kind: 'list' | 'collection' }) {
  const { activeServer, savedServers, activateServer } = useSavedServers()
  const [data, setData] = useState<SmpChoices | null>(null)
  const [title, setTitle] = useState('')
  const [typeCode, setTypeCode] = useState('')
  const [date, setDate] = useState(localDateInputValue)
  const [author, setAuthor] = useState('')
  const [notes, setNotes] = useState('')
  const [emptyReason, setEmptyReason] = useState('')
  const [selected, setSelected] = useState<string[]>(() => {
    const id = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.split('?')[1] || '').get('list')
    return kind === 'collection' && id ? [`List/${id}`] : []
  })
  const [destination, setDestination] = useState(activeServer?.baseUrl || '')
  const [review, setReview] = useState<Review | null>(null)
  const [acceptName, setAcceptName] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [published, setPublished] = useState(false)
  const progress = useRef<SmpProgress>({})
  const listProgress = useRef<SmpListSaveProgress>({})
  const inFlight = useRef(false)
  const listIdentifier = useRef(uuidIdentifier())
  useEffect(() => {
    if (!activeServer) return
    let cancelled = false
    setData(null)
    loadSmpChoices(activeServer.baseUrl, patientId, kind).then((value) => {
      if (cancelled) return
      setData(value)
      setTitle((previous) => previous || `${kind === 'list' ? 'Medication list' : 'Medication profile'} for ${getDisplayNameFromHumanName(value.patient.name?.[0]) || patientId}`)
    }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Source data unavailable.') })
    return () => { cancelled = true }
  }, [activeServer, patientId, kind, reload])
  const path = `/patients/${encodeURIComponent(patientId)}`
  const written = Boolean(progress.current.patient || progress.current.bundle || progress.current.uncertain || listProgress.current.list || listProgress.current.uncertain || published)
  const locked = busy || written || Boolean(review)

  async function perform(action: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try { await action() } catch (e) {
      if (e instanceof SmpSourceChangedError && !written) {
        progress.current = {}
        setReview(null)
        setReload((n) => n + 1)
      }
      setError(e instanceof Error ? e.message : 'Unable to complete SMP operation.')
    }
    finally { inFlight.current = false; setBusy(false) }
  }

  async function saveList() {
    if (!data || !activeServer) return
    await saveSmpMedicationList({ baseUrl: activeServer.baseUrl, patientId, choices: data, identifier: listIdentifier.current,
      title, typeCode, date, notes, author, selected, emptyReason: emptyReason || undefined }, listProgress.current)
    setRouteNotification({ routeHref: getRouteHref(`${path}?view=documents`), tone: 'success', message: `Medication List created successfully on ${activeServer.label}.` })
    navigateTo(`${path}?view=documents`)
  }

  async function prepare() {
    if (!data || !activeServer) return
    if (!title.trim() || !destination || !selected.length) throw new Error('Enter a title, destination, and select at least one List.')
    const lists = selected.map((ref) => {
      const option = data.options.find((o) => o.reference === ref)
      if (!option) throw new SmpSourceChangedError(`${ref} is unavailable. Choices are refreshing; review and submit again.`)
      return option.resource as List
    })
    const snapshot = await prepareSmpSnapshot(activeServer.baseUrl, data.patient, lists)
    const match = await matchSmpPatient(activeServer.baseUrl, destination, data.patient)
    setAcceptName(false)
    setReview({ snapshot, match, title: title.trim(), destination })
  }

  async function publish() {
    if (!review || !activeServer) return
    await publishSmpCollection({ sourceBase: activeServer.baseUrl, destinationBase: review.destination, title: review.title, snapshot: review.snapshot, match: review.match, acceptName }, progress.current)
    setPublished(true)
  }

  function openPublished() {
    const server = savedServers.find((s) => s.baseUrl === review?.destination)
    if (!server || !progress.current.index || !progress.current.patient) return
    activateServer(server)
    navigateTo(`/patients/${encodeURIComponent(progress.current.patient.id!)}/smp-collections/${encodeURIComponent(progress.current.index.id!)}`)
  }

  return <div className="panel smp-page">
    <div className="page-actions page-actions-spaced"><button type="button" className="secondary-button outline" disabled={busy} onClick={() => navigateTo(`${path}?view=documents`)}>Back to patient</button></div>
    <h2>{kind === 'list' ? 'Create medication list' : 'Create SMP collection'}</h2>
    <p>{kind === 'list' ? 'Save a reusable, point-in-time List on the active source server. Existing statements are not changed.' : 'Capture saved Lists and their supporting resources in a collection. Lists remain distinct; this does not reconcile medications.'}</p>
    {error ? <p className="error-banner" role="alert">{error}</p> : null}
    {!data ? <p role="status">{error ? 'Source choices unavailable.' : 'Loading source choices…'}</p> : <>
      <form onSubmit={(e) => { e.preventDefault(); void perform(kind === 'list' ? saveList : prepare) }}>
        <fieldset disabled={locked}>
          <div className="field-group"><label htmlFor="smp-title">Title</label><input id="smp-title" value={title} required onChange={(e) => setTitle(e.target.value)} /></div>
          {kind === 'list' ? <>
            <p>Mode: snapshot · Status: current</p>
            <div className="field-group"><label htmlFor="smp-type">List type</label><select id="smp-type" value={typeCode} required onChange={(e) => setTypeCode(e.target.value)}><option value="">Select a type</option>{LIST_TYPES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></div>
            <div className="field-group"><label htmlFor="smp-date">List date</label><input id="smp-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="field-group"><label htmlFor="smp-author">Author / source</label><select id="smp-author" required value={author} onChange={(e) => setAuthor(e.target.value)}><option value="">Select an author</option>{data.authors.map((o) => <option key={o.reference} value={o.reference}>{o.label}</option>)}</select></div>
            <div className="field-group"><label htmlFor="smp-notes">Notes</label><textarea id="smp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </> : <DestinationServerField id="smp-destination" servers={savedServers} value={destination} disabled={locked} onChange={setDestination} />}
          <TransferList label={kind === 'list' ? 'Medication statements' : 'Medication Lists'} showDates disabled={locked} values={selected}
            options={getResourceTransferChoices(data.options.map((o) => ({ ...o, display: o.label })), [kind === 'list' ? 'MedicationStatement' : 'List'])}
            onChange={(values) => { setSelected(values); if (values.length) setEmptyReason('') }} />
          {kind === 'list' && !selected.length ? <div className="field-group"><label htmlFor="smp-empty">Reason for an empty List</label><select id="smp-empty" required value={emptyReason} onChange={(e) => setEmptyReason(e.target.value)}><option value="">Select an explicit reason</option>{EMPTY_REASONS.map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></div> : null}
          <button className="primary-button" type="submit">{busy ? 'Preparing…' : kind === 'list' ? 'Save medication List' : 'Review collection'}</button>
        </fieldset>
      </form>
      {review ? <section className="summary-card"><h3>Review: {review.title}</h3>
        <p>Source: {activeServer?.baseUrl}<br />Destination: {review.destination}</p>
        <p>{review.snapshot.bundle.entry?.filter((e) => e.resource?.resourceType === 'List').length} Lists · {review.snapshot.bundle.entry?.filter((e) => e.resource?.resourceType === 'MedicationStatement').length} statements · {review.snapshot.bundle.entry?.length} total resources</p>
        {review.match.warning ? <p className="warning-banner">{review.match.warning}</p> : null}
        {review.match.patient ? <p>Destination patient: {getDisplayNameFromHumanName(review.match.patient.name?.[0])} (Patient/{review.match.patient.id})</p> : <>
          {review.match.nameCandidate ? <label><input type="checkbox" checked={acceptName} disabled={busy || written} onChange={(e) => setAcceptName(e.target.checked)} />Use name match: {getDisplayNameFromHumanName(review.match.nameCandidate.name?.[0])} · Patient/{review.match.nameCandidate.id} · {review.match.nameCandidate.birthDate || 'Birth date unavailable'}</label> : null}
          {!acceptName ? <p>A copy of the source Patient will be created on submission.</p> : null}
        </>}
        <p>Only the Patient when needed, collection Bundle, and index are written to the destination. Embedded resources are not separately created. Reloading this page loses retry state.</p>
        {review.snapshot.bundle.entry?.flatMap((e, i) => e.resource?.resourceType === 'List' ? [<SmpListContent key={i} list={e.resource as List} resolve={createBundleIndex(review.snapshot.bundle).resolve} />] : [])}
        {!published ? <><button type="button" className="primary-button" disabled={busy || Boolean(progress.current.uncertain)} onClick={() => void perform(publish)}>{busy ? 'Publishing…' : progress.current.bundle ? 'Retry indexing' : 'Publish collection'}</button>
          {!written ? <button type="button" className="secondary-button" disabled={busy} onClick={() => { progress.current = {}; setReview(null) }}>Edit selection</button> : null}</> : <><p className="success-banner" role="status">Collection and index created.</p><button type="button" className="primary-button" onClick={openPublished}>Open on destination</button></>}
      </section> : null}
      {progress.current.patient ? <p>Retained destination Patient: {progress.current.patient.id}</p> : null}
      {progress.current.bundle ? <p>Retained Bundle: <a href={`${review?.destination}/Bundle/${progress.current.bundle.id}`} target="_blank" rel="noreferrer">{review?.destination}/Bundle/{progress.current.bundle.id}</a></p> : null}
      {progress.current.uncertain ? <p className="warning-banner">The {progress.current.uncertain} write outcome is uncertain. Verify the server before starting another submission; automatic retry is disabled.</p> : null}
      {listProgress.current.uncertain ? <p className="warning-banner">The List write outcome is uncertain. Verify the source server before starting another submission; automatic retry is disabled.</p> : null}
    </>}
  </div>
}
