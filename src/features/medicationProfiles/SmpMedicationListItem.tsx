/** Presents a medication List as a clinical disclosure and loads its live members once the user first expands it, with optional independent collection selection. */
import { useEffect, useState } from 'react'
import type { List } from 'fhir/r4'
import { ClinicalEntrySummary } from '../../components/ClinicalEntrySummary'
import { FhirJsonLink } from '../../components/FhirJsonLink'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { formatDate, getCodeableConceptText } from '../../lib/fhir/formatters'
import { SmpListContent } from './SmpListContent'
import { loadSmpListDetails } from './smpListDetails'
import { getResourceTimestamp } from '../../lib/fhir/resourceTimestamp'

export function SmpMedicationListItem({ list, baseUrl, patientId, selection }: { list: List; baseUrl: string; patientId: string; selection?: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void } }) {
  const [requested, setRequested] = useState(false)
  const [data, setData] = useState<Awaited<ReturnType<typeof loadSmpListDetails>> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!requested) return
    let cancelled = false
    loadSmpListDetails(baseUrl, patientId, list).then((value) => { if (!cancelled) setData(value) }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Medication List details unavailable.')
    })
    return () => { cancelled = true }
  }, [requested, baseUrl, patientId, list])
  const title = list.title || getCodeableConceptText(list.code) || list.id || 'Medication List'
  const timestamp = selection ? getResourceTimestamp(list) : { dateValue: list.date, dateLabel: list.date ? 'List date' : undefined }
  return <li className={`clinical-list-item clinical-list-expandable-item${selection ? ' smp-selectable-list' : ''}`}>
    {selection ? <input type="checkbox" aria-label={`Include ${title}`} checked={selection.checked} disabled={selection.disabled}
      onChange={(event) => selection.onChange(event.currentTarget.checked)} /> : null}
    <details className="clinical-entry-disclosure" onToggle={(event) => { if (event.currentTarget.open) setRequested(true) }}>
      <summary><ClinicalEntrySummary title={title}
        secondaryText={`${list.entry?.length || 0} ${list.entry?.length === 1 ? 'medication' : 'medications'}`}
        dateLabel={timestamp.dateLabel} dateValue={timestamp.dateValue ? formatDate(timestamp.dateValue) : selection ? 'Date unavailable' : undefined} showDisclosure /></summary>
      {requested && !data && !error ? <p className="info-banner" role="status">Loading medication List details…</p> : null}
      {error ? <p className="warning-banner" role="alert">{error}</p> : null}
      {data ? <>{data.warning ? <p className="warning-banner">{data.warning}</p> : null}
        <SmpListContent list={data.list} resolve={createBundleIndex(data.bundle, baseUrl).resolve} baseUrl={baseUrl} embedded />
      </> : null}
      {!data ? <div className="fhir-resource-actions"><FhirJsonLink resource={list} baseUrl={baseUrl} /></div> : null}
    </details>
  </li>
}
