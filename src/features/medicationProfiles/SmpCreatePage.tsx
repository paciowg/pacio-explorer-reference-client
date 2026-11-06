/** Coordinates source List authoring and single-step collection publication with in-session recovery state. */
import { SubmissionForm, SubmissionErrors, ValidationField } from '../../components/SubmissionForm'
import { issueCollector } from '../../lib/formValidation'
import { calendarDateValue } from '../../lib/dateTime'
import { EMPTY_REASONS, MEDICATION_LIST_TYPE_CHOICES } from '../../igs/pacioSmp/smp'
import { PatientFormHeader } from '../../components/PatientFormHeader'
import { useEffect, useRef, useState } from 'react'
import type { List } from 'fhir/r4'
import { uuidIdentifier } from '../../igs/pacioSmp/smp'
import { TransferList } from '../../components/TransferList'
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
import { SmpCollectionListSelector } from './SmpCollectionListSelector'
import { SmpListEmptyReason, SmpListFields } from './SmpListFields'

type PreparedCollection = { snapshot: PreparedSnapshot; match: DestinationMatch; title: string; destination: string }

export function SmpCreatePage({ patientId, kind }: { patientId: string; kind: 'list' | 'collection' }) {
  const { activeServer, savedServers } = useSavedServers()
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
  const prepared = useRef<PreparedCollection | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
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
      if (kind === 'collection') setSelected((values) => values.filter((ref) => value.options.some((option) => option.reference === ref)))
      setTitle((previous) => previous || `${kind === 'list' ? 'Medication list' : 'Medication profile'} for ${getDisplayNameFromHumanName(value.patient.name?.[0]) || patientId}`)
    }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Source data unavailable.') })
    return () => { cancelled = true }
  }, [activeServer, patientId, kind, reload])
  const path = `/patients/${encodeURIComponent(patientId)}`
  const written = Boolean(progress.current.patient || progress.current.bundle || progress.current.uncertain || listProgress.current.list || listProgress.current.uncertain)
  const locked = busy || written

  function validateForm() {
    const v = issueCollector()
    // Retained collection writes must remain retryable with their original, locked inputs.
    if (written) return v.issues
    v.require('smp-title', title.trim(), 'Enter a List or collection title.')
    if (kind === 'collection') {
      v.require('smp-destination', savedServers.some((server) => server.baseUrl === destination), 'Select a destination FHIR server.')
      v.require('selected', selected.length, 'Select at least one saved medication List.')
    } else {
      v.require('smp-type', MEDICATION_LIST_TYPE_CHOICES.some(([code]) => code === typeCode), 'Select a medication list type.')
      v.check('smp-date', () => calendarDateValue(date, 'List date'))
      v.require('smp-author', data?.authors.some((option) => option.reference === author), 'Select the List author.')
      if (!selected.length) v.require('smp-empty', EMPTY_REASONS.some(([code]) => code === emptyReason), 'Select statements or an explicit empty reason.')
    }
    return v.issues
  }

  async function perform(action: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try { await action() } catch (e) {
      if (e instanceof SmpSourceChangedError && !written) {
        progress.current = {}
        prepared.current = null
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

  async function createCollection() {
    if (!data || !activeServer) return
    if (!title.trim() || !destination || !selected.length) throw new Error('Enter a title, destination, and select at least one List.')
    if (!prepared.current) {
      const lists = selected.map((ref) => {
        const option = data.options.find((o) => o.reference === ref)
        if (!option) throw new SmpSourceChangedError(`${ref} is unavailable. Choices are refreshing; review and submit again.`)
        return option.resource as List
      })
      const snapshot = await prepareSmpSnapshot(activeServer.baseUrl, data.patient, lists)
      const match = await matchSmpPatient(activeServer.baseUrl, destination, data.patient)
      prepared.current = { snapshot, match, title: title.trim(), destination }
    }
    const input = prepared.current
    try {
      await publishSmpCollection({ sourceBase: activeServer.baseUrl, destinationBase: input.destination, title: input.title, snapshot: input.snapshot, match: input.match }, progress.current)
    } catch (error) {
      if (!progress.current.patient && !progress.current.bundle && !progress.current.uncertain) {
        prepared.current = null
        progress.current = {}
      }
      throw error
    }
    const label = savedServers.find((server) => server.baseUrl === input.destination)?.label || input.destination
    setRouteNotification({ routeHref: getRouteHref(`${path}?view=documents`), tone: 'success', message: `SMP Collection created successfully on ${label}.` })
    navigateTo(`${path}?view=documents`)
  }

  return <div className="panel">
    <PatientFormHeader title={kind === 'list' ? 'Create Medication List' : 'Create SMP Collection'} patient={data?.patient}
      serverLabel={activeServer?.label || ''} serverBaseUrl={activeServer?.baseUrl || ''}
      onBack={() => navigateTo(`${path}?view=documents`)} backDisabled={busy} />
    <div className="smp-page">
    {kind === 'list' ? <p>Save a reusable, point-in-time List on the active source server. Existing statements are not changed.</p> : null}
    {!data && error ? <p className="error-banner" role="alert">{error}</p> : null}
    {!data ? <p role="status">{error ? 'Source choices unavailable.' : 'Loading source choices…'}</p> : <>
      <SubmissionForm error={error} validate={validateForm} onSubmit={(e) => { e.preventDefault(); return perform(kind === 'list' ? saveList : createCollection) }}>
        <fieldset disabled={locked}>
          {kind === 'collection' ? <DestinationServerField id="smp-destination" servers={savedServers} value={destination} disabled={locked} onChange={setDestination} /> : null}
          <SubmissionErrors error={error} />
          <ValidationField field="smp-title" className="field-group"><label htmlFor="smp-title">Title</label><input id="smp-title" value={title} required onChange={(e) => setTitle(e.target.value)} /></ValidationField>
          {kind === 'list' ? <SmpListFields value={{ typeCode, date, author, notes }} authors={data.authors} onChange={(patch) => {
            if (patch.typeCode !== undefined) setTypeCode(patch.typeCode)
            if (patch.date !== undefined) setDate(patch.date)
            if (patch.author !== undefined) setAuthor(patch.author)
            if (patch.notes !== undefined) setNotes(patch.notes)
          }} /> : null}
          {kind === 'collection' ? <ValidationField field="selected"><SmpCollectionListSelector key={reload} options={data.options} baseUrl={activeServer?.baseUrl || ''} patientId={patientId}
            values={selected} disabled={locked} onChange={setSelected} /></ValidationField> : <TransferList label="Medication statements" showDates disabled={locked} values={selected}
            options={getResourceTransferChoices(data.options.map((o) => ({ ...o, display: o.label })), ['MedicationStatement'])}
            onChange={(values) => { setSelected(values); if (values.length) setEmptyReason('') }} />}
          {kind === 'list' && !selected.length ? <SmpListEmptyReason value={emptyReason} onChange={setEmptyReason} /> : null}
        </fieldset>
        <button className="primary-button" type="submit" disabled={busy || (kind === 'list' && written) || Boolean(progress.current.uncertain || listProgress.current.uncertain)}>{busy ? (kind === 'list' ? 'Saving…' : 'Creating…') : kind === 'list' ? 'Save medication List' : progress.current.bundle ? 'Retry indexing' : written ? 'Retry creating SMP Collection' : 'Create SMP Collection'}</button>
      </SubmissionForm>
      {prepared.current?.match.warning ? <p className="warning-banner">{prepared.current.match.warning}</p> : null}
      {progress.current.patient ? <p>Retained destination Patient: {progress.current.patient.id}</p> : null}
      {progress.current.bundle ? <p>Retained Bundle: <a href={`${prepared.current?.destination}/Bundle/${progress.current.bundle.id}`} target="_blank" rel="noreferrer">{prepared.current?.destination}/Bundle/{progress.current.bundle.id}</a></p> : null}
      {progress.current.uncertain ? <p className="warning-banner">The {progress.current.uncertain} write outcome is uncertain. Verify the server before starting another submission; automatic retry is disabled.</p> : null}
      {listProgress.current.uncertain ? <p className="warning-banner">The List write outcome is uncertain. Verify the source server before starting another submission; automatic retry is disabled.</p> : null}
    </>}
    </div>
  </div>
}
