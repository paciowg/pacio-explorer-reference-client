/** Owns destination-only submission of a saved document, retaining completed write stages for in-session retries. */
import { useEffect, useRef, useState } from 'react'
import { getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import type { DocumentPublicationProgress } from '../../lib/fhir/documentPublishing'
import type { SavedDocument } from '../../lib/fhir/savedDocuments'
import { normalizeBaseUrl } from '../../lib/fhir/url'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { setRouteNotification } from '../../lib/routing/routeNotification'
import { DestinationServerField } from '../servers/DestinationServerField'
import { useSavedServers } from '../servers/useSavedServers'
import { SavedDocumentPreview } from './SavedDocumentPreview'
import { documentKindLabels, loadSavedDocument, sendSavedDocument, type DocumentKind } from './sendDocument'

export function SendDocumentPage({ patientId, resourceId, kind }: { patientId: string; resourceId: string; kind: DocumentKind }) {
  const { activeServer, savedServers } = useSavedServers()
  const [data, setData] = useState<SavedDocument | null>(null)
  const [destination, setDestination] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const progress = useRef<DocumentPublicationProgress>({})
  const inFlight = useRef(false)
  useEffect(() => {
    if (!activeServer) return
    let current = true
    setData(null)
    setLoading(true)
    setError('')
    loadSavedDocument(activeServer.baseUrl, patientId, resourceId, kind).then((data) => { if (current) setData(data) })
      .catch((error: unknown) => { if (current) setError(error instanceof Error ? error.message : 'Unable to load the saved document.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [activeServer, patientId, resourceId, kind, reload])

  if (!activeServer) return null
  const sourceBase = activeServer.baseUrl
  const servers = savedServers.filter((server) => normalizeBaseUrl(server.baseUrl) !== normalizeBaseUrl(sourceBase))
  const selected = servers.find((server) => server.baseUrl === destination)
  const locked = busy || Boolean(progress.current.destination)
  const disabled = busy || !data || !selected || Boolean(progress.current.uncertain || progress.current.index)
  const backPath = `/patients/${encodeURIComponent(patientId)}?view=documents`

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || inFlight.current || progress.current.index || progress.current.uncertain || !data || !selected) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      await sendSavedDocument({ sourceBase, destinationBase: selected.baseUrl, data, kind }, progress.current)
      setRouteNotification({ routeHref: getRouteHref(backPath), tone: 'success', message: `${documentKindLabels[kind]} sent successfully to ${selected.label}.` })
      navigateTo(backPath)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to send the document.')
    } finally { inFlight.current = false; setBusy(false) }
  }

  return <section className="panel">
    <div className="panel-header"><div>
      <h2>Send {documentKindLabels[kind]}</h2>
      {data ? <p className="create-patient-name">{getDisplayNameFromHumanName(data.patient.name?.[0])}</p> : null}
    </div><div className="panel-server-details"><span className="panel-server-label">{activeServer.label}</span><span className="panel-server-url">{sourceBase}</span></div></div>
    <div className="page-actions page-actions-spaced"><button type="button" className="secondary-button outline" disabled={busy} onClick={() => navigateTo(backPath)}>Back to patient</button></div>
    {error ? <p className="error-banner" role="alert">{error}</p> : null}
    {loading ? <p role="status">Loading saved document…</p> : null}
    {!loading && !data ? <button type="button" className="secondary-button outline" onClick={() => setReload((n) => n + 1)}>Retry loading</button> : null}
    {data ? <>
      <p>Send the saved content to another FHIR server.</p>
      {!servers.length ? <p className="info-banner">Connect to another FHIR server to save a destination, then return to this source server.</p> : null}
      <form onSubmit={(event) => { void submit(event) }}>
        <DestinationServerField id="send-document-destination" servers={servers} value={destination} disabled={locked || !servers.length} onChange={setDestination} />
        <SavedDocumentPreview data={data} kind={kind} sourceBase={sourceBase} />
        <div className="page-actions page-actions-spaced"><button type="submit" className="primary-button" disabled={disabled}>{busy ? 'Sending…' : 'Send to server'}</button></div>
      </form>
      {progress.current.bundle && !progress.current.uncertain && !progress.current.index ? <p className="info-banner">The Bundle was saved on the destination server. Sending again will retry its DocumentReference only.</p> : null}
      {progress.current.uncertain ? <p className="warning-banner" role="alert">The {progress.current.uncertain} write outcome is uncertain. Verify the destination server before starting another submission; retry is disabled.</p> : null}
    </> : null}
  </section>
}
