/** Loads destination-local nutrition choices using explicit patient allergy searches rather than relying on $everything. */
import type { AllergyIntolerance, Bundle, Patient, Reference, Resource } from 'fhir/r4'
import { findDestinationPatient } from '../../lib/fhir/destinationPatient'
import { allergyBelongsToPatient } from '../../lib/fhir/allergies'
import { searchResources } from '../../lib/fhir/resourceTransport'
import { getRolePreferredReferenceOptions, type ResourceReferenceOption } from '../../lib/fhir/resourceOptions'

export type NutritionReferenceOption = ResourceReferenceOption
export type NutritionCreateData = { patient: Patient | null; options: NutritionReferenceOption[]; warning: string }

export async function searchPatientAllergies(baseUrl: string, patientId: string): Promise<Bundle> {
  const bundle = await searchResources(baseUrl, 'AllergyIntolerance', { patient: patientId })
  if (bundle.link?.some((link) => link.relation === 'next')) throw new Error('The allergy search exceeded the retrieval limit. Narrow the destination data before creating an order.')
  return { ...bundle, entry: bundle.entry?.filter((entry) => entry.resource?.resourceType === 'AllergyIntolerance' && allergyBelongsToPatient(entry.resource as AllergyIntolerance, patientId, baseUrl)) }
}

export async function loadNutritionCreateData(sourceBaseUrl: string, destinationBaseUrl: string, patient: Patient): Promise<NutritionCreateData> {
  const destinationPatient = await findDestinationPatient({ sourceBaseUrl, destinationBaseUrl, patient })
  const bundles = await Promise.all(['Practitioner', 'PractitionerRole'].map((type) => searchResources(destinationBaseUrl, type)))
  let warning = ''
  if (destinationPatient?.id) {
    bundles.push(await searchPatientAllergies(destinationBaseUrl, destinationPatient.id))
    try { bundles.push(await searchResources(destinationBaseUrl, 'Encounter', { patient: destinationPatient.id })) }
    catch { warning = 'Encounter choices are unavailable. You can omit the optional encounter reference.' }
  }
  const resources = new Map<string, Resource>()
  for (const bundle of bundles) for (const entry of bundle.entry ?? []) {
    const resource = entry.resource
    if (resource?.id) resources.set(`${resource.resourceType}/${resource.id}`, resource)
  }
  const options = getRolePreferredReferenceOptions(resources, destinationBaseUrl)
  return { patient: destinationPatient, options, warning }
}

export function nutritionReference(options: NutritionReferenceOption[], value: string, types: string[]): Reference | undefined {
  if (!value) return undefined
  const option = options.find((option) => option.reference === value && types.includes(option.resource.resourceType))
  if (!option) throw new Error('A selected reference is no longer available on the destination.')
  return { reference: option.reference, display: option.display }
}
