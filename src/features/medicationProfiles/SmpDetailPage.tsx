/** Loads SMP details with patient checks and keeps collection resolution confined to the stored Bundle. */
import { useEffect, useState } from 'react'
import type { Bundle, DocumentReference, List, Patient } from 'fhir/r4'
import { isSmpIndex } from '../../igs/pacioSmp/smp'
import { FhirJsonLink } from '../../components/FhirJsonLink'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { loadDocumentDetails } from '../../lib/fhir/documentDetails'
import { readServerResource } from '../../lib/fhir/resourceTransport'
import { formatDate, getCodeableConceptText, getDisplayNameFromHumanName, placeholderValue } from '../../lib/fhir/formatters'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { useSavedServers } from '../servers/useSavedServers'
import { samePatient } from './smpReferences'
import { SmpListContent } from './SmpListContent'
import { snapshotResolver, unresolvedSnapshotReferences, validateSnapshotPatient } from './smpViewing'
import { loadSmpListDetails } from './smpListDetails'

type DetailData = { patient: Patient; bundle: Bundle; lists: List[]; index?: DocumentReference; warning?: string }

export function SmpDetailPage({ patientId, resourceId, kind }: { patientId: string; resourceId: string; kind: 'list' | 'collection' }) {
  const { activeServer } = useSavedServers()
  const [data, setData] = useState<DetailData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!activeServer) return
    let cancelled = false
    const base = activeServer.baseUrl
    async function load(): Promise<DetailData> {
      if (kind === 'collection') {
        const loaded = await loadDocumentDetails(base, patientId, resourceId)
        if (!samePatient(base, patientId, loaded.documentReference.subject?.reference)) throw new Error('DocumentReference belongs to another patient.')
        if (!isSmpIndex(loaded.documentReference)) throw new Error('DocumentReference is not an SMP collection index.')
        if (!loaded.bundle) return { patient: loaded.patient, bundle: { resourceType: 'Bundle', type: 'collection' }, lists: [], index: loaded.documentReference, warning: 'Bundle attachment unavailable or unsupported. Only same-server Bundle URLs are supported.' }
        validateSnapshotPatient(loaded.bundle, loaded.patient)
        const missing = unresolvedSnapshotReferences(loaded.bundle)
        return { patient: loaded.patient, bundle: loaded.bundle, lists: loaded.bundle.entry!.flatMap((e) => e.resource?.resourceType === 'List' ? [e.resource as List] : []), index: loaded.documentReference,
          warning: missing.length ? `Unresolved captured references: ${missing.join(', ')}. No live resources were substituted.` : undefined }
      }
      const list = await readServerResource(base, `List/${resourceId}`) as List
      const loaded = await loadSmpListDetails(base, patientId, list)
      return { ...loaded, lists: [list] }
    }
    load().then((value) => { if (!cancelled) setData(value) }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load SMP resource.') })
    return () => { cancelled = true }
  }, [activeServer, patientId, resourceId, kind])
  const resolve = data ? kind === 'collection' ? snapshotResolver(data.bundle) : createBundleIndex(data.bundle, activeServer?.baseUrl).resolve : null
  if (kind === 'collection') {
    if (!activeServer) return null
    const index = data?.index
    const metadata = index ? [
      { label: 'Type', value: getCodeableConceptText(index.type) },
      { label: 'Status', value: index.status },
      { label: 'Document status', value: index.docStatus },
      { label: 'Author', value: index.author?.map((author) => author.display || author.reference).filter(Boolean).join(', ') },
      { label: 'Custodian', value: index.custodian?.display || index.custodian?.reference },
      { label: 'Identifier', value: [index.masterIdentifier, ...(index.identifier || [])].flatMap((identifier) => identifier?.value ? [identifier.value] : []).join(', ') },
    ].filter((row) => row.value) : []
    return <section className="panel">
      <div className="panel-header">
        <h2>SMP Collection</h2>
        <div className="panel-server-details">
          <span className="panel-server-label">{activeServer.label}</span>
          <span className="panel-server-url">{activeServer.baseUrl}</span>
        </div>
      </div>
      <div className="page-actions page-actions-spaced">
        <button type="button" className="secondary-button outline" onClick={() => navigateTo(`/patients/${encodeURIComponent(patientId)}?view=documents`)}>Back to patient</button>
      </div>
      {error ? <p className="error-banner" role="alert">{error}</p> : !data ? <p className="info-banner" role="status">Loading SMP collection...</p> : <>
        <section className="patient-summary-hero">
          <div>
            <p className="patient-summary-name">{index?.description || getCodeableConceptText(index?.type) || 'SMP Collection'}</p>
            <p className="patient-summary-meta">
              {getDisplayNameFromHumanName(data.patient.name?.[0]) || data.patient.id || placeholderValue()} · Date {formatDate(index?.date)} · DocumentReference/{index?.id || resourceId}
            </p>
          </div>
        </section>
        <div className="smp-page">
          {index ? <section className="summary-card">
            <h3>Collection Details</h3>
            <dl className="detail-grid">
              {metadata.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
            </dl>
            <p>Medication lists reflect the saved collection.</p>
          </section> : null}
          {data.warning ? <p className="warning-banner">{data.warning}</p> : null}
          {data.lists.map((list, i) => <SmpListContent key={`${list.id}:${i}`} list={list} resolve={resolve!} showListJson={false} />)}
          <div className="page-actions">
            {index?.id ? <div>DocumentReference: <FhirJsonLink resource={index} baseUrl={activeServer.baseUrl} /></div> : null}
            {data.bundle.id ? <div>Bundle: <FhirJsonLink resource={data.bundle} baseUrl={activeServer.baseUrl} /></div> : null}
          </div>
        </div>
      </>}
    </section>
  }
  return <div className="panel smp-page">
    <a href={getRouteHref(`/patients/${encodeURIComponent(patientId)}?view=documents`)}>Back to Documents</a>
    <h2>Medication List</h2>
    {error ? <p className="error-banner" role="alert">{error}</p> : !data ? <p role="status">Loading…</p> : <>
      <p>{getDisplayNameFromHumanName(data.patient.name?.[0])}</p>
      {data.warning ? <p className="warning-banner">{data.warning}</p> : null}
      {data.lists.map((list, i) => <SmpListContent key={`${list.id}:${i}`} list={list} resolve={resolve!} baseUrl={activeServer?.baseUrl} />)}
    </>}
  </div>
}
