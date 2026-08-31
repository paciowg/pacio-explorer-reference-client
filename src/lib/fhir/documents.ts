/** Constructs generic FHIR document Bundles without depending on PACIO profiles or terminology. */
import type { Bundle, BundleEntry, Composition, Identifier } from 'fhir/r4'

export type CreateDocumentBundleInput = {
  timestamp: string
  compositionEntry: BundleEntry & { resource: Composition }
  supportingEntries: BundleEntry[]
  identifier?: Identifier
  profileUrls?: string[]
}

/**
 * Creates the common FHIR document envelope. FHIR requires the Composition to be
 * the first entry in a document Bundle: https://hl7.org/fhir/R4/documents.html
 */
export function createDocumentBundle(input: CreateDocumentBundleInput): Bundle {
  return {
    resourceType: 'Bundle',
    ...(input.profileUrls?.length ? { meta: { profile: input.profileUrls } } : {}),
    ...(input.identifier ? { identifier: input.identifier } : {}),
    type: 'document',
    timestamp: input.timestamp,
    entry: [input.compositionEntry, ...input.supportingEntries],
  }
}
