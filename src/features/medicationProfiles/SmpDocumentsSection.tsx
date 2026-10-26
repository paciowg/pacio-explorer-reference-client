/** Loads patient-scoped SMP records and presents separate medication List and collection sections in Documents. */
import { useEffect, useState } from 'react'
import { ClinicalEntrySummary } from '../../components/ClinicalEntrySummary'
import { compareDatesDesc } from '../../lib/dateTime'
import { formatDate } from '../../lib/fhir/formatters'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { loadSmpDocuments } from './smpData'
import { SmpMedicationListItem } from './SmpMedicationListItem'

type SmpDocumentsData = Awaited<ReturnType<typeof loadSmpDocuments>>

export function SmpDocumentsSection({ baseUrl, patientId }: { baseUrl: string; patientId: string }) {
  const [data, setData] = useState<SmpDocumentsData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    loadSmpDocuments(baseUrl, patientId).then((value) => { if (!cancelled) setData(value) }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'SMP records unavailable.') })
    return () => { cancelled = true }
  }, [baseUrl, patientId])
  return <SmpDocumentsContent baseUrl={baseUrl} patientId={patientId} data={data} error={error} />
}

export function SmpDocumentsContent({ baseUrl, patientId, data, error = '' }: { baseUrl: string; patientId: string; data: SmpDocumentsData | null; error?: string }) {
  const listError = error || data?.listError
  const indexError = error || data?.indexError
  return <>
    <section className="summary-card clinical-summary-card">
      <div className="clinical-summary-header"><h3>SMP Medication Lists</h3><span className="clinical-summary-cap">Up to 10 items</span></div>
      {listError ? <p className="warning-banner">Lists unavailable: {listError}</p> : !data ? <p role="status">Loading medication Lists…</p>
        : data.lists?.length ? <ul className="clinical-list">{[...data.lists].sort((a, b) => compareDatesDesc(a.date, b.date)).slice(0, 10).map((list) =>
          <SmpMedicationListItem key={`${baseUrl}:${patientId}:${list.id}`} list={list} baseUrl={baseUrl} patientId={patientId} />
        )}</ul> : <p className="empty-state">None recorded</p>}
      <div className="clinical-section-footer"><button type="button" className="secondary-button outline compact" onClick={() => navigateTo(`/patients/${encodeURIComponent(patientId)}/medication-lists/new`)}>Create medication list</button></div>
    </section>
    <section className="summary-card clinical-summary-card">
      <div className="clinical-summary-header"><h3>SMP Collections</h3><span className="clinical-summary-cap">Up to 10 items</span></div>
      {indexError ? <p className="warning-banner">Collections unavailable: {indexError}</p> : !data ? <p role="status">Loading SMP collections…</p>
        : data.indexes?.length ? <ul className="clinical-list">{[...data.indexes].sort((a, b) => compareDatesDesc(a.date, b.date)).slice(0, 10).map((index) => <li key={index.id} className="clinical-list-selectable-item">
          <button type="button" className="clinical-select-button" onClick={() => navigateTo(`/patients/${encodeURIComponent(patientId)}/smp-collections/${encodeURIComponent(index.id!)}`)}>
            <ClinicalEntrySummary title={index.description || 'SMP medication collection'} secondaryText={index.status} dateLabel={index.date ? 'Date' : undefined} dateValue={index.date ? formatDate(index.date) : undefined} />
          </button>
        </li>)}</ul> : <p className="empty-state">None recorded</p>}
      <div className="clinical-section-footer"><a className="secondary-button outline compact" href={getRouteHref(`/patients/${encodeURIComponent(patientId)}/smp-collections/new`)}>Create SMP collection</a></div>
    </section>
  </>
}
