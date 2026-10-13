/** Loads destination-local reference choices without creating a Patient or copying source clinical resources. */
import type { Patient, Resource, Reference } from 'fhir/r4'
import { findDestinationPatient } from '../../lib/fhir/destinationPatient'
import { fetchPatientEverything } from '../../lib/fhir/client'
import { searchResources } from '../../lib/fhir/deviceTransport'
import { getRolePreferredReferenceOptions, type ResourceReferenceOption } from '../../lib/fhir/resourceOptions'

export type ReferenceOption = ResourceReferenceOption
export type DeviceCreateData = { patient: Patient | null; options: ReferenceOption[]; warning: string }

export async function loadDeviceCreateData(sourceBaseUrl: string, destinationBaseUrl: string, patient: Patient): Promise<DeviceCreateData> {
  const destinationPatient = await findDestinationPatient({ sourceBaseUrl, destinationBaseUrl, patient })
  const bundles = await Promise.all(['Organization', 'PractitionerRole', 'Practitioner'].map((type) => searchResources(destinationBaseUrl, type)))
  let warning = ''
  if (destinationPatient?.id) {
    try { bundles.push(await fetchPatientEverything(destinationBaseUrl, destinationPatient.id)) }
    catch { warning = 'Patient clinical reference choices are unavailable because $everything failed. You can still create a request without these optional references.' }
    // RelatedPerson is not consistently included by Patient/$everything implementations.
    try { bundles.push(await searchResources(destinationBaseUrl, 'RelatedPerson', { patient: destinationPatient.id })) }
    catch { warning += ' Related-person choices are unavailable.' }
  }
  const resources = new Map<string, Resource>()
  for (const bundle of bundles) for (const entry of bundle.entry ?? []) {
    if (entry.resource?.id && (entry.resource.resourceType !== 'Patient' || entry.resource.id === destinationPatient?.id)) resources.set(`${entry.resource.resourceType}/${entry.resource.id}`, entry.resource)
  }
  if (destinationPatient?.id) resources.set(`Patient/${destinationPatient.id}`, destinationPatient)
  else resources.set('Patient/pending', { ...patient, id: 'pending' })
  return { patient: destinationPatient, warning, options: getRolePreferredReferenceOptions(resources, destinationBaseUrl) }
}

export function optionReference(options: ReferenceOption[], value: string): Reference | undefined {
  if (!value) return undefined
  const option = options.find((item) => item.reference === value)
  if (!option) throw new Error('A selected reference is no longer available on the destination.')
  return { reference: option.reference, display: option.display }
}
