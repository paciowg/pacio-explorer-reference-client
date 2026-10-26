/** Displays List membership with source links for live resources and captured JSON for snapshots, using only the supplied resolver. */
import type { List, MedicationStatement, Practitioner, PractitionerRole, Resource } from 'fhir/r4'
import type { SmpResolver } from '../../igs/pacioSmp/smp'
import { FhirResourceDetails } from '../../components/FhirResourceDetails'
import { FhirJson } from '../../components/FhirJson'
import { FhirJsonLink } from '../../components/FhirJsonLink'
import { buildResourceDetailModel } from '../../lib/fhir/resourceDetails'
import { formatDate, getCodeableConceptText, getPractitionerRoleDisplayName } from '../../lib/fhir/formatters'
import { statementDisplay } from './smpData'
import { getResourceSelectionDisplay } from '../../lib/fhir/resourceOptions'

export function SmpResourceContent({ resource, resolve, baseUrl, sourceResource = resource }: { resource: Resource; resolve: SmpResolver; baseUrl?: string; sourceResource?: Resource }) {
  const model = buildResourceDetailModel(resource, (ref) => resolve(ref, resource))
  return <>{model ? <FhirResourceDetails model={model} /> : null}{baseUrl
    ? <div className="fhir-resource-actions"><FhirJsonLink resource={sourceResource} baseUrl={baseUrl} /></div>
    : <details><summary>Captured FHIR JSON</summary><FhirJson resource={resource} /></details>}</>
}

export function SmpListContent({ list, resolve, embedded = false, baseUrl }: { list: List; resolve: SmpResolver; embedded?: boolean; baseUrl?: string }) {
  const source = resolve(list.source?.reference, list)
  const role = source?.resourceType === 'PractitionerRole' ? source as PractitionerRole : undefined
  const practitioner = role ? resolve(role.practitioner?.reference, role) : undefined
  const sourceDisplay = role ? getPractitionerRoleDisplayName(role, new Map(practitioner?.resourceType === 'Practitioner' && role.practitioner?.reference ? [[role.practitioner.reference, practitioner as Practitioner]] : [])) : source ? getResourceSelectionDisplay(source) : list.source?.reference
  return <section className={embedded ? 'fhir-resource-details' : 'summary-card'}>
    {!embedded ? <h3>{list.title || getCodeableConceptText(list.code) || list.id || 'Medication List'}</h3> : null}
    <dl className="fhir-detail-grid">
      <div><dt>List type</dt><dd>{getCodeableConceptText(list.code) || '--'}</dd></div>
      <div><dt>Status</dt><dd>{list.status}</dd></div>
      <div><dt>Mode</dt><dd>{list.mode}</dd></div>
      <div><dt>Date</dt><dd>{list.date ? formatDate(list.date) : 'Date unavailable'}</dd></div>
      <div className="fhir-detail-field-multiline"><dt>Source</dt><dd>{list.source?.display || sourceDisplay || 'Unavailable'}</dd></div>
      {list.note?.length ? <div className="fhir-detail-field-multiline"><dt>Notes</dt><dd>{list.note.map((note, i) => <p key={i}>{note.text}</p>)}</dd></div> : null}
      {list.emptyReason ? <div className="fhir-detail-field-multiline"><dt>Empty reason</dt><dd>{getCodeableConceptText(list.emptyReason)}</dd></div> : null}
    </dl>
    {!list.entry?.length && !list.emptyReason ? <p className="warning-banner">No entries or explicit empty reason were provided.</p> : null}
    {list.entry?.length ? <dl className="fhir-detail-grid"><div className="fhir-detail-field-multiline">
      <dt>Medications</dt><dd className="smp-medication-members">{list.entry.map((entry, i) => {
      const statement = resolve(entry.item.reference, list)
      const patient = resolve(list.subject?.reference, list)
      const member = statement?.resourceType === 'MedicationStatement' ? statement as MedicationStatement : undefined
      const matchesPatient = member && patient && resolve(member.subject?.reference, member) === patient
      // Contained statements have no standalone endpoint; their source is the owning List.
      const sourceResource = entry.item.reference?.startsWith('#') ? list : member
      return <details className="clinical-entry-disclosure" key={`${entry.item.reference}:${i}`}><summary>
        <span className="clinical-entry-chevron" aria-hidden="true">›</span>
        <span className="clinical-item-title">{matchesPatient ? statementDisplay(member, resolve) : entry.item.display || entry.item.reference || 'Unresolved statement'}
          {entry.deleted ? ' (removed)' : ''}</span>
      </summary>{matchesPatient ? <SmpResourceContent resource={member} resolve={resolve} baseUrl={baseUrl}
        sourceResource={sourceResource} /> : <p className="warning-banner">Statement unavailable{member ? ' or its patient could not be verified' : ''}: {entry.item.reference}</p>}</details>
      })}</dd>
    </div></dl> : null}
    {baseUrl ? <div className="fhir-resource-actions"><FhirJsonLink resource={list} baseUrl={baseUrl} /></div>
      : <details><summary>List FHIR JSON</summary><FhirJson resource={list} /></details>}
  </section>
}
