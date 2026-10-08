/** Loads destination-local nutrition choices using explicit patient allergy searches rather than relying on $everything. */
import type { AllergyIntolerance, Bundle, Patient, PractitionerRole, Reference, Resource } from 'fhir/r4'
import { findDestinationPatient } from '../../lib/fhir/destinationPatient'
import { allergyBelongsToPatient } from '../../lib/fhir/allergies'
import { searchResources, serverResourceUrl } from '../../lib/fhir/resourceTransport'
import { getSimpleResourceDisplay } from '../../lib/fhir/resourceDisplay'
import { getPractitionerMap, getPractitionerRoleOptions } from '../../lib/fhir/resourceOptions'

export type NutritionReferenceOption = { reference: string; label: string; resource: Resource }
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
  const bundle: Bundle = { resourceType: 'Bundle', type: 'collection', entry: [...resources.values()].map((resource) => ({ resource })) }
  const practitioners = getPractitionerMap(bundle)
  const coveredPractitioners = new Set<string>()
  // Prefer destination roles over duplicate bare practitioners, including absolute and versioned references.
  for (const resource of resources.values()) {
    if (resource.resourceType !== 'PractitionerRole') continue
    const reference = (resource as PractitionerRole).practitioner?.reference
    if (!reference) continue
    try {
      const id = serverResourceUrl(destinationBaseUrl, reference).match(/\/Practitioner\/([^/]+)(?:\/_history\/[^/]+)?$/)?.[1]
      const practitioner = id ? practitioners.get(`Practitioner/${id}`) : undefined
      if (practitioner) {
        practitioners.set(reference, practitioner)
        coveredPractitioners.add(`Practitioner/${id}`)
      }
    } catch { /* References outside the destination cannot represent its practitioners. */ }
  }
  const roles = new Map(getPractitionerRoleOptions(bundle, practitioners).map((option) => [`PractitionerRole/${option.role.id}`, option.label]))
  const options = [...resources].filter(([reference]) => !coveredPractitioners.has(reference)).map(([reference, resource]) => {
    const label = roles.get(reference) || getSimpleResourceDisplay(resource)
    return { reference, resource, label: `${resource.resourceType}: ${label}` }
  }).sort((a, b) => a.label.localeCompare(b.label))
  return { patient: destinationPatient, options, warning }
}

export function nutritionReference(options: NutritionReferenceOption[], value: string, types: string[]): Reference | undefined {
  if (!value) return undefined
  const option = options.find((option) => option.reference === value && types.includes(option.resource.resourceType))
  if (!option) throw new Error('A selected reference is no longer available on the destination.')
  return { reference: option.reference, display: option.label.replace(/^[^:]+: /, '') }
}
