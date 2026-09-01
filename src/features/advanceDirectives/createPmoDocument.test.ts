/** Verifies PMO creation orchestration and the resources posted to the FHIR server. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bundle, Composition, DocumentReference } from 'fhir/r4'
import {
  fixturePatient,
  fixturePractitioner,
  fixturePractitionerRole,
  FIXED_CREATED_AT,
  FIXED_SIGNED_DATE,
} from '../../test/fixtures/adiPmoFixture'

const mocks = vi.hoisted(() => ({
  closeBundleReferences: vi.fn(async (_baseUrl: string, bundle: Bundle) => bundle),
  ensureDestinationPatient: vi.fn(),
  createBundle: vi.fn(),
  createDocumentReference: vi.fn(),
}))

vi.mock('../../lib/fhir/closedBundle', () => ({
  closeBundleReferences: mocks.closeBundleReferences,
}))
vi.mock('../../lib/fhir/destinationPatient', () => ({
  ensureDestinationPatient: mocks.ensureDestinationPatient,
}))
vi.mock('../../lib/fhir/client', () => ({
  createBundle: mocks.createBundle,
  createDocumentReference: mocks.createDocumentReference,
}))

import { createPmoDocument } from './createPmoDocument'

const input = {
  sourceBaseUrl: 'https://source.test/fhir/',
  destinationBaseUrl: 'https://destination.test/fhir/',
  patient: fixturePatient,
  practitionerRole: fixturePractitionerRole,
  practitionerByReference: new Map([['Practitioner/practitioner-1', fixturePractitioner]]),
  author: { reference: 'PractitionerRole/role-1', display: 'Dr. Grace Hopper — Physician' },
  attester: { reference: 'Patient/patient-1', display: 'Ada Lovelace' },
  authenticator: { reference: 'PractitionerRole/role-1', display: 'Dr. Grace Hopper — Physician' },
  custodian: { reference: 'Organization/organization-1', display: 'Example Hospital' },
  status: 'final' as const,
  signedDate: FIXED_SIGNED_DATE,
  contextPeriodEnd: '2026-01-01T00:00:00.000Z',
  createdAt: FIXED_CREATED_AT,
  pdfBase64: 'JVBERi0xLjQ=',
}

beforeEach(() => {
  mocks.closeBundleReferences.mockClear()
  mocks.createBundle.mockReset().mockResolvedValue({ resourceType: 'Bundle', type: 'document', id: 'bundle-1' })
  mocks.createDocumentReference.mockReset().mockResolvedValue({ resourceType: 'DocumentReference', status: 'current', content: [] })
  mocks.ensureDestinationPatient.mockReset().mockResolvedValue({
    patient: { ...fixturePatient, id: 'destination-patient-1' },
    created: false,
  })
  let sequence = 0
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++sequence}`) })
})

afterEach(() => vi.unstubAllGlobals())

describe('createPmoDocument', () => {
  it('closes and posts the Bundle before posting the companion DocumentReference', async () => {
    const order: string[] = []
    mocks.createBundle.mockImplementation(async (_baseUrl, bundle: Bundle) => {
      order.push('Bundle')
      return { ...bundle, id: 'bundle-1' }
    })
    mocks.createDocumentReference.mockImplementation(async (_baseUrl, documentReference: DocumentReference) => {
      order.push('DocumentReference')
      return documentReference
    })

    await createPmoDocument(input)

    expect(order).toEqual(['Bundle', 'DocumentReference'])
    expect(mocks.closeBundleReferences).toHaveBeenCalledWith(
      'https://source.test/fhir/',
      expect.anything(),
    )
    expect(mocks.ensureDestinationPatient).toHaveBeenCalledWith({
      sourceBaseUrl: 'https://source.test/fhir/',
      destinationBaseUrl: 'https://destination.test/fhir/',
      patient: fixturePatient,
    })
    expect(mocks.createBundle.mock.calls[0][0]).toBe('https://destination.test/fhir/')
    expect(mocks.createDocumentReference.mock.calls[0][0]).toBe(
      'https://destination.test/fhir/',
    )
    const postedBundle = mocks.createBundle.mock.calls[0][1] as Bundle
    const postedDocumentReference = mocks.createDocumentReference.mock.calls[0][1] as DocumentReference
    const postedComposition = postedBundle.entry?.[0].resource as Composition
    expect(postedBundle.type).toBe('document')
    expect(postedBundle.entry?.[0].resource).toMatchObject({
      resourceType: 'Composition',
      identifier: { system: 'https://pacioproject.org/adi-document-identifier', value: 'uuid-1' },
    })
    expect(postedDocumentReference).toMatchObject({
      masterIdentifier: { system: 'https://pacioproject.org/adi-document-identifier', value: 'uuid-1' },
      identifier: [{ system: 'https://pacioproject.org/adi-document-set-identifier', value: 'uuid-2' }],
      subject: { reference: 'Patient/destination-patient-1' },
      content: [{ attachment: { url: 'https://destination.test/fhir/Bundle/bundle-1' } }],
    })
    expect(postedDocumentReference.author).toBeUndefined()
    expect(postedDocumentReference.authenticator).toBeUndefined()
    expect(postedDocumentReference.custodian).toBeUndefined()
    expect(postedComposition.author).toEqual([
      expect.objectContaining({ display: input.author.display }),
    ])
    expect(postedComposition.custodian).toEqual(
      expect.objectContaining({ reference: 'Organization/organization-1' }),
    )
    expect(postedComposition.identifier).toEqual(postedDocumentReference.masterIdentifier)
  })

  it('retains participant references on a same-server DocumentReference', async () => {
    await createPmoDocument({
      ...input,
      destinationBaseUrl: 'https://source.test/fhir',
    })

    const document = mocks.createDocumentReference.mock.calls[0][1] as DocumentReference
    expect(document.author).toEqual([input.author])
    expect(document.authenticator).toEqual(input.authenticator)
    expect(document.custodian).toEqual(input.custodian)
  })

  it('preserves the created Bundle when the DocumentReference write fails', async () => {
    mocks.createDocumentReference.mockRejectedValue(new Error('DocumentReference write failed.'))

    await expect(createPmoDocument(input)).rejects.toThrow('DocumentReference write failed.')
    expect(mocks.createBundle).toHaveBeenCalledOnce()
    expect(mocks.createDocumentReference).toHaveBeenCalledOnce()
  })
})
