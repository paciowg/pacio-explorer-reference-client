/** Presents independent collection selection and lazy clinical previews without owning publication state. */
import type { List } from 'fhir/r4'
import type { ResourceReferenceOption } from '../../lib/fhir/resourceOptions'
import { getResourceTimestamp } from '../../lib/fhir/resourceTimestamp'
import { compareClinicalDatesDesc } from '../../lib/dateTime'
import { SmpMedicationListItem } from './SmpMedicationListItem'

export function SmpCollectionListSelector({ options, values, baseUrl, patientId, disabled, onChange }: {
  options: ResourceReferenceOption[]; values: string[]; baseUrl: string; patientId: string; disabled: boolean; onChange: (values: string[]) => void
}) {
  const sorted = [...options].sort((a, b) => compareClinicalDatesDesc(getResourceTimestamp(a.resource).dateValue, getResourceTimestamp(b.resource).dateValue, a.resource.meta?.lastUpdated, b.resource.meta?.lastUpdated))
  return <section aria-label="Medication Lists">
    <h3>Medication Lists</h3>
    <p role="status">{values.length} selected</p>
    {sorted.length ? <ul className="clinical-list">{sorted.map((option) => <SmpMedicationListItem key={option.reference}
      list={option.resource as List} baseUrl={baseUrl} patientId={patientId}
      selection={{ checked: values.includes(option.reference), disabled, onChange: (checked) => {
        if (disabled) return
        onChange(checked ? [...values, option.reference] : values.filter((value) => value !== option.reference))
      } }} />)}</ul> : <p className="empty-state">No medication Lists are available for this patient.</p>}
  </section>
}
