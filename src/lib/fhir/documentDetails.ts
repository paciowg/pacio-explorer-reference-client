/** Loads the common patient, DocumentReference, and optional same-server Bundle used by document detail pages. */
import type { Bundle, DocumentReference, Patient } from 'fhir/r4'
import { fetchBundleByReference, fetchDocumentReference, fetchPatient } from './client'
import { getReferencedBundleUrl } from './documentReferences'

export type LoadedDocumentDetails = {
  patient: Patient
  documentReference: DocumentReference
  bundleReference: string
  bundle: Bundle | null
  bundleError: unknown
}

export async function loadDocumentDetails(
  baseUrl: string,
  patientId: string,
  documentReferenceId: string,
): Promise<LoadedDocumentDetails> {
  const [patient, documentReference] = await Promise.all([
    fetchPatient(baseUrl, patientId),
    fetchDocumentReference(baseUrl, documentReferenceId),
  ])
  const bundleReference = getReferencedBundleUrl(documentReference, baseUrl)

  if (!bundleReference) {
    return { patient, documentReference, bundleReference, bundle: null, bundleError: null }
  }

  try {
    const bundle = await fetchBundleByReference(baseUrl, bundleReference)
    return { patient, documentReference, bundleReference, bundle, bundleError: null }
  } catch (bundleError) {
    return { patient, documentReference, bundleReference, bundle: null, bundleError }
  }
}
