/** Loads live medication List members with patient checks and partial-data warnings for inline and standalone views. */
import type { Bundle, List, MedicationStatement, PractitionerRole, Resource } from 'fhir/r4'
import { isSmpList } from '../../igs/pacioSmp/smp'
import { fetchPatient } from '../../lib/fhir/client'
import { readServerResource } from '../../lib/fhir/resourceTransport'
import { samePatient } from './smpReferences'

export async function loadSmpListDetails(baseUrl: string, patientId: string, list: List) {
  if (!isSmpList(list) || !samePatient(baseUrl, patientId, list.subject?.reference)) throw new Error('This is not a medication List for the selected patient.')
  const patient = await fetchPatient(baseUrl, patientId)
  const entries: { fullUrl?: string; resource: Resource }[] = [{ resource: list }, { resource: patient }]
  const warnings: string[] = []
  const references = [list.source?.reference, ...(list.entry || []).map((e) => e.item.reference)]
    .filter((ref): ref is string => Boolean(ref) && !ref!.startsWith('#'))
  for (const ref of new Set(references)) {
    try {
      const linked = await readServerResource(baseUrl, ref)
      const statement = linked as MedicationStatement
      if (linked.resourceType === 'MedicationStatement' && !samePatient(baseUrl, patientId, statement.subject?.reference)) throw new Error('Statement belongs to another patient.')
      entries.push({ fullUrl: ref, resource: linked })
      const practitionerReference = linked.resourceType === 'PractitionerRole' ? (linked as PractitionerRole).practitioner?.reference : undefined
      if (practitionerReference && !practitionerReference.startsWith('#')) entries.push({ fullUrl: practitionerReference, resource: await readServerResource(baseUrl, practitionerReference) })
      if (linked.resourceType === 'MedicationStatement' && statement.medicationReference?.reference && !statement.medicationReference.reference.startsWith('#')) entries.push({ fullUrl: statement.medicationReference.reference, resource: await readServerResource(baseUrl, statement.medicationReference.reference) })
    } catch (error) { warnings.push(`${ref}: ${error instanceof Error ? error.message : 'Unavailable'}`) }
  }
  const bundle: Bundle = { resourceType: 'Bundle', type: 'collection', entry: entries }
  return { patient, list, bundle, warning: warnings.join(' ') }
}
