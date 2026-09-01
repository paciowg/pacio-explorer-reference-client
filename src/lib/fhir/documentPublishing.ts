/** Publishes a patient document from its source server to a selected destination FHIR server. */
import type { Bundle, DocumentReference, Patient } from 'fhir/r4'
import { withUrnUuidBundleReferences } from './bundleReferences'
import { createBundle, createDocumentReference } from './client'
import { closeBundleReferences } from './closedBundle'
import { ensureDestinationPatient } from './destinationPatient'
import { normalizeBaseUrl } from './url'

export type PublishDocumentInput = {
  sourceBaseUrl: string
  destinationBaseUrl: string
  patient: Patient
  bundle: Bundle
  buildDocumentReference: (bundleUrl: string, destinationPatient: Patient) => DocumentReference
  missingBundleIdMessage: string
}

/**
 * Keeps the Bundle and DocumentReference as deliberate separate writes. If indexing fails,
 * the already-created document remains available on the server.
 */
export async function publishDocument(input: PublishDocumentInput) {
  const closedBundle = await closeBundleReferences(input.sourceBaseUrl, input.bundle)
  const portableBundle = withUrnUuidBundleReferences(closedBundle)
  const destinationPatient = await ensureDestinationPatient({
    sourceBaseUrl: input.sourceBaseUrl,
    destinationBaseUrl: input.destinationBaseUrl,
    patient: input.patient,
  })
  const createdBundle = await createBundle(input.destinationBaseUrl, portableBundle)

  if (!createdBundle.id) {
    throw new Error(input.missingBundleIdMessage)
  }

  const bundleUrl = `${normalizeBaseUrl(input.destinationBaseUrl)}/Bundle/${createdBundle.id}`
  return createDocumentReference(
    input.destinationBaseUrl,
    input.buildDocumentReference(bundleUrl, destinationPatient.patient),
  )
}
