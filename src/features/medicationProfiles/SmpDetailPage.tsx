/** Loads SMP details with patient checks and keeps collection resolution confined to the stored Bundle. */
import { useEffect, useState } from 'react'
import type { Bundle, DocumentReference, List, Patient } from 'fhir/r4'
import { isSmpIndex } from '../../igs/pacioSmp/smp'
import { FhirJsonLink } from '../../components/FhirJsonLink'
import { FhirJson } from '../../components/FhirJson'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { loadDocumentDetails } from '../../lib/fhir/documentDetails'
import { readServerResource } from '../../lib/fhir/resourceTransport'
import { formatDate, getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import { getRouteHref } from '../../lib/routing/routes'
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
  return <div className="panel smp-page">
    <a href={getRouteHref(`/patients/${encodeURIComponent(patientId)}?view=documents`)}>Back to Documents</a>
    <h2>{kind === 'collection' ? 'SMP medication collection' : 'Medication List'}</h2>
    {error ? <p className="error-banner" role="alert">{error}</p> : !data ? <p role="status">Loading…</p> : <>
      <p>{getDisplayNameFromHumanName(data.patient.name?.[0])}</p>
      {data.index ? <section className="summary-card"><h3>{data.index.description}</h3><p>{formatDate(data.index.date)} · {data.index.status}</p>
        <FhirJsonLink resource={data.index} baseUrl={activeServer?.baseUrl} /> <FhirJsonLink resource={data.bundle} baseUrl={activeServer?.baseUrl} />
        <p>This view uses the stored collection snapshot. Embedded resources are not independently created on this server.</p>
        <details><summary>Index metadata</summary><FhirJson resource={data.index} /></details>
      </section> : null}
      {data.warning ? <p className="warning-banner">{data.warning}</p> : null}
      {data.lists.map((list, i) => <SmpListContent key={`${list.id}:${i}`} list={list} resolve={resolve!} baseUrl={kind === 'list' ? activeServer?.baseUrl : undefined} />)}
    </>}
  </div>
}
