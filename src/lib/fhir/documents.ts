import type { Bundle, BundleEntry, Composition } from 'fhir/r4'

export type CreateDocumentBundleInput = {
  timestamp: string
  compositionEntry: BundleEntry & { resource: Composition }
  supportingEntries: BundleEntry[]
}

export function createDocumentBundle(input: CreateDocumentBundleInput): Bundle {
  return {
    resourceType: 'Bundle',
    type: 'document',
    timestamp: input.timestamp,
    entry: [input.compositionEntry, ...input.supportingEntries],
  }
}
