/** Loads patient-scoped destination choices and resolves usable MedicationRequest medications without copying clinical resources. */
import type { MedicationRequest, MedicationStatement, Patient, RelatedPerson, Resource } from 'fhir/r4'
import { findDestinationPatient } from '../../lib/fhir/destinationPatient'
import { readServerResource, searchResources, serverResourceUrl } from '../../lib/fhir/resourceTransport'
import { getResourceSelectionDisplay, getRolePreferredReferenceOptions, type ResourceReferenceOption } from '../../lib/fhir/resourceOptions'
import { getCodeableConceptText } from '../../lib/fhir/formatters'
import { normalizeBaseUrl } from '../../lib/fhir/url'
import { samePatient } from '../medicationProfiles/smpReferences'

export type StatementMedication = Pick<MedicationStatement, 'medicationCodeableConcept' | 'medicationReference'>
export type StatementRequestChoice = ResourceReferenceOption & { resource: MedicationRequest; medication: StatementMedication }
export type StatementCreateData = { patient: Patient | null; options: ResourceReferenceOption[]; requests: StatementRequestChoice[]; warning: string }
export const REASON_TYPES = ['Condition', 'Observation', 'DiagnosticReport']
export const SOURCE_TYPES = ['Patient', 'RelatedPerson', 'PractitionerRole', 'Practitioner']

export function belongsToStatementPatient(resource: Resource, patientId: string, baseUrl: string) {
  if (resource.resourceType === 'RelatedPerson') return samePatient(baseUrl, patientId, (resource as RelatedPerson).patient?.reference)
  if (resource.resourceType === 'Encounter' || resource.resourceType === 'MedicationRequest' || REASON_TYPES.includes(resource.resourceType)) {
    return samePatient(baseUrl, patientId, (resource as { subject?: { reference?: string } }).subject?.reference)
  }
  return resource.resourceType === 'Patient' && resource.id === patientId
}

export async function loadStatementCreateData(sourceBaseUrl: string, destinationBaseUrl: string, patient: Patient): Promise<StatementCreateData> {
  const matched = await findDestinationPatient({ sourceBaseUrl, destinationBaseUrl, patient })
  const resources = new Map<string, Resource>()
  const warnings: string[] = []
  const patientTypes = ['MedicationRequest', 'Encounter', 'RelatedPerson', ...REASON_TYPES]
  const types = ['Medication', 'PractitionerRole', 'Practitioner', ...(matched?.id ? patientTypes : [])]
  const results = await Promise.allSettled(types.map(async (type) => {
    const bundle = await searchResources(destinationBaseUrl, type, patientTypes.includes(type) ? { patient: matched!.id! } : {})
    if (bundle.link?.some((link) => link.relation === 'next')) throw new Error('The search exceeded the retrieval limit.')
    return (bundle.entry || []).flatMap(({ resource }) => resource?.id && resource.resourceType === type &&
      (!patientTypes.includes(type) || belongsToStatementPatient(resource, matched!.id!, destinationBaseUrl)) ? [resource] : [])
  }))
  results.forEach((result, index) => {
    if (result.status === 'rejected') warnings.push(`${types[index]} choices are unavailable.`)
    else for (const resource of result.value) resources.set(`${resource.resourceType}/${resource.id}`, resource)
  })
  if (matched) resources.set(`Patient/${matched.id}`, matched)
  else resources.set('Patient/pending', { ...patient, id: 'pending' })

  const medications = new Map<string, StatementMedication>()
  // Resolve references once per target. External and contained medications cannot be copied as standalone references.
  const resolved = new Map<string, Promise<Resource>>()
  for (const [reference, candidate] of [...resources]) {
    if (candidate.resourceType !== 'MedicationRequest') continue
    const resource = candidate as MedicationRequest
    if (resource.medicationCodeableConcept && resource.medicationReference) continue
    if (resource.medicationCodeableConcept?.coding?.some((coding) => coding.system && coding.code)) {
      medications.set(reference, { medicationCodeableConcept: structuredClone(resource.medicationCodeableConcept) })
    } else if (resource.medicationReference?.reference) {
      try {
        const key = serverResourceUrl(destinationBaseUrl, resource.medicationReference.reference).slice(normalizeBaseUrl(destinationBaseUrl).length + 1)
        if (!key.startsWith('Medication/')) continue
        const stored = resources.get(key)
        if (!stored && !resolved.has(key)) resolved.set(key, readServerResource(destinationBaseUrl, key))
        const medication = stored || await resolved.get(key)!
        if (medication.resourceType !== 'Medication' || !medication.id || `Medication/${medication.id}` !== key.replace(/\/_history\/[^/]+$/, '')) continue
        const version = key.match(/\/_history\/([^/]+)$/)?.[1]
        if (version && medication.meta?.versionId !== version) continue
        resources.set(key, medication)
        medications.set(reference, { medicationReference: { ...resource.medicationReference, reference: key,
          display: resource.medicationReference.display || getResourceSelectionDisplay(medication) } })
      } catch { /* Unsupported or unavailable medication targets make this optional request ineligible. */ }
    }
  }
  const options = getRolePreferredReferenceOptions(resources, destinationBaseUrl)
  const requests = options.flatMap((option): StatementRequestChoice[] => {
    const medication = medications.get(option.reference)
    if (option.resource.resourceType !== 'MedicationRequest' || !medication) return []
    const display = getCodeableConceptText(medication.medicationCodeableConcept) || medication.medicationReference?.display || option.display
    return [{ ...option, display: `${display} — ${option.resource.id}`, resource: option.resource as MedicationRequest, medication }]
  })
  return { patient: matched, options, requests, warning: warnings.join(' ') }
}
