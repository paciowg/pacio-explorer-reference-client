/** Identifies the immediate resources backing grouped device and document displays without crawling references. */
import type { DeviceRequest, DeviceUseStatement, DocumentReference, DomainResource, Resource } from 'fhir/r4'
import { getReferencedBundleUrl } from '../../lib/fhir/documentReferences'

export type RelatedFhirResource = { reference: string; resource?: Resource }

export function getRelatedFhirResources(resource: Resource, baseUrl: string): RelatedFhirResource[] {
  const reference = resource.resourceType === 'DeviceRequest' ? (resource as DeviceRequest).codeReference?.reference
    : resource.resourceType === 'DeviceUseStatement' ? (resource as DeviceUseStatement).device?.reference
      : resource.resourceType === 'DocumentReference' ? getReferencedBundleUrl(resource as DocumentReference, baseUrl)
        : undefined
  if (!reference) return []
  const contained = reference.startsWith('#')
    ? (resource as DomainResource).contained?.find((entry) => `#${entry.id}` === reference)
    : undefined
  return [{ reference, resource: contained }]
}
