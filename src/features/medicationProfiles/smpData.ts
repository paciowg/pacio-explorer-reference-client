/** Loads complete patient-scoped SMP choices, enriching statement labels without gating selection on profile compatibility. */
import type { Bundle, DocumentReference, List, Medication, MedicationStatement, Patient, Resource } from 'fhir/r4'
import { isSmpIndex, isSmpList, validateSmpMedicationList } from '../../igs/pacioSmp/smp'
import { fetchPatient } from '../../lib/fhir/client'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { getRolePreferredReferenceOptions, type ResourceReferenceOption } from '../../lib/fhir/resourceOptions'
import { getCodeableConceptText } from '../../lib/fhir/formatters'
import { readServerResource, searchResources } from '../../lib/fhir/resourceTransport'
import { samePatient, sourceReference } from './smpReferences'

export async function completeSearch(baseUrl: string, type: string, parameters: Record<string, string> = {}) {
  const bundle = await searchResources(baseUrl, type, parameters)
  if (bundle.link?.some((link) => link.relation === 'next')) throw new Error(`${type} search is incomplete (500-resource safety limit). Narrow the server data before creating an SMP resource.`)
  return [...new Map((bundle.entry || []).flatMap((e) => e.resource && e.resource.resourceType === type && e.resource.id ? [[e.resource.id, e.resource] as const] : [])).values()]
}

export async function loadSmpDocuments(baseUrl: string, patientId: string) {
  const [lists, indexes] = await Promise.allSettled([
    completeSearch(baseUrl, 'List', { subject: `Patient/${patientId}` }),
    completeSearch(baseUrl, 'DocumentReference', { patient: patientId }),
  ])
  return {
    lists: lists.status === 'fulfilled' ? (lists.value as List[]).filter((list) => samePatient(baseUrl, patientId, list.subject?.reference) && isSmpList(list)) : null,
    indexes: indexes.status === 'fulfilled' ? (indexes.value as DocumentReference[]).filter((index) => samePatient(baseUrl, patientId, index.subject?.reference) && isSmpIndex(index)) : null,
    listError: lists.status === 'rejected' ? String(lists.reason instanceof Error ? lists.reason.message : 'List search failed.') : '',
    indexError: indexes.status === 'rejected' ? String(indexes.reason instanceof Error ? indexes.reason.message : 'Collection search failed.') : '',
  }
}

export function statementDisplay(statement: MedicationStatement, resolve: (ref: string | undefined, owner?: Resource) => Resource | undefined) {
  const med = resolve(statement.medicationReference?.reference, statement)
  return getCodeableConceptText(statement.medicationCodeableConcept) || (med?.resourceType === 'Medication' ? getCodeableConceptText((med as Medication).code) : '') || statement.medicationReference?.display || statement.id || 'Unnamed medication'
}

export type SmpChoices = {
  patient: Patient
  options: ResourceReferenceOption[]
  authors: ResourceReferenceOption[]
  bundle: Bundle
}

export async function loadSmpChoices(baseUrl: string, patientId: string, kind: 'list' | 'collection'): Promise<SmpChoices> {
  const [patient, records, practitioners, roles] = await Promise.all([
    fetchPatient(baseUrl, patientId),
    completeSearch(baseUrl, kind === 'list' ? 'MedicationStatement' : 'List', { subject: `Patient/${patientId}` }),
    kind === 'list' ? completeSearch(baseUrl, 'Practitioner') : Promise.resolve([]),
    kind === 'list' ? completeSearch(baseUrl, 'PractitionerRole') : Promise.resolve([]),
  ])
  const scoped = records.filter((resource) => samePatient(baseUrl, patientId, (resource as List | MedicationStatement).subject?.reference))
  const resources = new Map<string, Resource>([patient, ...scoped, ...practitioners, ...roles].map((r) => [`${r.resourceType}/${r.id}`, r]))
  const options: ResourceReferenceOption[] = []
  for (const resource of scoped) {
    if (resource.resourceType === 'List' && (!isSmpList(resource as List) || validateSmpMedicationList(resource as List, (r) => samePatient(baseUrl, patientId, r)).length)) continue
    const ref = `${resource.resourceType}/${resource.id}`
    const medicationReference = (resource as MedicationStatement).medicationReference?.reference
    if (resource.resourceType === 'MedicationStatement' && medicationReference && !medicationReference.startsWith('#')) {
      try {
        const key = sourceReference(baseUrl, medicationReference)
        if (!resources.has(key)) resources.set(key, await readServerResource(baseUrl, key))
      } catch { /* Medication reads enrich labels only; the statement remains selectable. */ }
    }
    const resolve = (reference: string | undefined, owner?: Resource) => {
      if (!reference) return undefined
      if (reference.startsWith('#')) return createBundleIndex({ resourceType: 'Bundle', type: 'collection' }).resolve(reference, owner)
      try { return resources.get(sourceReference(baseUrl, reference)) } catch { return undefined }
    }
    const display = resource.resourceType === 'MedicationStatement' ? statementDisplay(resource as MedicationStatement, resolve) : (resource as List).title || getCodeableConceptText((resource as List).code) || resource.id!
    const details = resource.resourceType === 'MedicationStatement' ? (resource as MedicationStatement).dosage?.map((d) => d.text).filter(Boolean).join('; ') : `${(resource as List).entry?.length || 0} statements; ${getCodeableConceptText((resource as List).code)}`
    const context = [(resource as List | MedicationStatement).status, details].filter(Boolean).join(' — ')
    options.push({ reference: ref, display, label: `${display}${context ? ` — ${context}` : ''}`, resource })
  }
  const authors = getRolePreferredReferenceOptions(new Map([...practitioners, ...roles].map((r) => [`${r.resourceType}/${r.id}`, r])), baseUrl)
  return { patient, options, authors, bundle: { resourceType: 'Bundle', type: 'collection', entry: [...resources].map(([fullUrl, resource]) => ({ fullUrl, resource })) } }
}
