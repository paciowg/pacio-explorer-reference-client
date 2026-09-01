/** Verifies shared document-detail loading and optional Bundle failure behavior. */
import type { Bundle, DocumentReference, Patient } from 'fhir/r4'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchBundleByReference: vi.fn(),
  fetchDocumentReference: vi.fn(),
  fetchPatient: vi.fn(),
}))

vi.mock('./client', () => mocks)

import { loadDocumentDetails } from './documentDetails'

const patient: Patient = { resourceType: 'Patient', id: 'patient-1' }
const documentReference: DocumentReference = {
  resourceType: 'DocumentReference',
  id: 'document-1',
  status: 'current',
  content: [{ attachment: { url: 'https://example.test/fhir/Bundle/bundle-1' } }],
}
const bundle: Bundle = { resourceType: 'Bundle', id: 'bundle-1', type: 'document' }

beforeEach(() => {
  mocks.fetchPatient.mockReset().mockResolvedValue(patient)
  mocks.fetchDocumentReference.mockReset().mockResolvedValue(documentReference)
  mocks.fetchBundleByReference.mockReset().mockResolvedValue(bundle)
})

describe('loadDocumentDetails', () => {
  it('loads the patient, index resource, and referenced Bundle', async () => {
    await expect(loadDocumentDetails(
      'https://example.test/fhir',
      'patient-1',
      'document-1',
    )).resolves.toEqual({
      patient,
      documentReference,
      bundleReference: 'https://example.test/fhir/Bundle/bundle-1',
      bundle,
      bundleError: null,
    })
  })

  it('returns optional Bundle failures without failing the document load', async () => {
    const bundleError = new Error('Bundle unavailable')
    mocks.fetchBundleByReference.mockRejectedValue(bundleError)

    await expect(loadDocumentDetails(
      'https://example.test/fhir',
      'patient-1',
      'document-1',
    )).resolves.toMatchObject({
      patient,
      documentReference,
      bundle: null,
      bundleError,
    })
  })
})
