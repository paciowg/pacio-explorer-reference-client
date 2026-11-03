/** Adapts prepared SMP snapshots and index metadata to the shared document publisher, retaining SMP freshness checks. */
import type { List, Reference } from 'fhir/r4'
import { buildSmpDocumentReference } from '../../igs/pacioSmp/smp'
import { publishPreparedDocument, type DestinationMatch, type DocumentPublicationProgress } from '../../lib/fhir/documentPublishing'
import { normalizeBaseUrl } from '../../lib/fhir/url'
import { createResourceWithOutcome } from '../../lib/fhir/resourceTransport'
import { portableDocumentPatient } from '../../lib/fhir/documentPortability'
import { assertSnapshotUnchanged, sourceReference, type PreparedSnapshot } from './smpReferences'

// Retain existing imports for List/MedicationStatement callers while the implementation lives in shared FHIR code.
export { FhirCreateError as SmpWriteError, createResourceWithOutcome as writeSmpResource } from '../../lib/fhir/resourceTransport'
export { matchDocumentPatient as matchSmpPatient, type DestinationMatch } from '../../lib/fhir/documentPublishing'
export type SmpProgress = DocumentPublicationProgress & { publicationKey?: string }

export async function publishSmpCollection(input: { sourceBase: string; destinationBase: string; title: string; snapshot: PreparedSnapshot; match: DestinationMatch }, progress: SmpProgress) {
  if (progress.uncertain) throw new Error(`Verify the destination after the uncertain ${progress.uncertain} write before starting another submission.`)
  const publicationKey = JSON.stringify([normalizeBaseUrl(input.sourceBase), normalizeBaseUrl(input.destinationBase), input.title, input.snapshot.bundle, input.match.patient?.id])
  if (progress.publicationKey && publicationKey !== progress.publicationKey) throw new Error('Publication inputs changed. Start a new collection rather than reusing retained writes.')
  if (progress.index) return progress.index
  if (!progress.bundle) await assertSnapshotUnchanged(input.sourceBase, input.snapshot)
  progress.publicationKey = publicationKey
  return publishPreparedDocument({
    sourceBaseUrl: input.sourceBase,
    destinationBaseUrl: input.destinationBase,
    bundle: input.snapshot.bundle,
    ensurePatient: async () => {
      if (input.match.patient) return input.match.patient
      return createResourceWithOutcome(input.destinationBase, portableDocumentPatient(input.snapshot.patient))
    },
    buildDocumentReference: (bundleUrl, patient) => {
      const firstList = input.snapshot.bundle.entry?.find((e) => e.resource?.resourceType === 'List')?.resource as List
      // Index author targets are narrower than List.source; the shared publisher handles cross-server omission.
      const originalList = [...input.snapshot.originals.values()].find((r) => r.resourceType === 'List') as List
      const source = originalList.source?.reference
      let author: Reference | undefined
      if (source && !source.startsWith('#')) {
        if (sourceReference(input.sourceBase, source).startsWith('PractitionerRole/')) author = originalList.source
      }
      if (!firstList || !patient.id) throw new Error('Invalid destination patient.')
      return buildSmpDocumentReference({
        identifier: input.snapshot.bundle.identifier!, title: input.title, timestamp: input.snapshot.bundle.timestamp!,
        patient: { reference: `Patient/${patient.id}` }, bundleUrl, author,
      })
    },
  }, progress)
}
