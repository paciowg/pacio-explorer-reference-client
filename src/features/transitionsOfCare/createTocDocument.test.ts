/** Verifies TOC creation write ordering, identifiers, and partial-failure behavior. */
import type { Bundle, DocumentReference, Patient } from 'fhir/r4'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOC_SECTION_DEFINITIONS } from '../../igs/pacioToc/tocDocument'

const mocks = vi.hoisted(() => ({
  closeBundleReferences: vi.fn(async (_baseUrl: string, bundle: Bundle) => bundle),
  createBundle: vi.fn(),
  createDocumentReference: vi.fn(),
}))
vi.mock('../../lib/fhir/closedBundle', () => ({ closeBundleReferences: mocks.closeBundleReferences }))
vi.mock('../../lib/fhir/client', () => ({ createBundle: mocks.createBundle, createDocumentReference: mocks.createDocumentReference }))
import { createTocDocument } from './createTocDocument'

const patient: Patient = { resourceType: 'Patient', id: 'patient-1', name: [{ text: 'Ada Lovelace' }] }
const input = {
  baseUrl: 'https://example.test/fhir/', patient, title: 'Transfer Summary', status: 'final' as const,
  createdAt: '2026-01-02T03:04:05Z', author: { reference: 'PractitionerRole/role-1' },
  custodian: { reference: 'Organization/org-1' }, sections: TOC_SECTION_DEFINITIONS.map((definition) => ({
    key: definition.key, entries: definition.key === 'problems' ? [{ resourceType: 'Condition' as const, id: 'condition-1' }] : [], emptyReason: 'unavailable',
  })),
}

beforeEach(() => {
  let sequence = 0
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++sequence}`) })
  mocks.createBundle.mockReset().mockResolvedValue({ resourceType: 'Bundle', type: 'document', id: 'bundle-1' })
  mocks.createDocumentReference.mockReset().mockResolvedValue({ resourceType: 'DocumentReference', status: 'current', content: [] })
  mocks.closeBundleReferences.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('createTocDocument', () => {
  it('posts the closed Bundle before its companion DocumentReference', async () => {
    await createTocDocument(input)
    const bundle = mocks.createBundle.mock.calls[0][1] as Bundle
    const document = mocks.createDocumentReference.mock.calls[0][1] as DocumentReference
    const composition = bundle.entry?.[0]?.resource as import('fhir/r4').Composition | undefined
    expect(mocks.closeBundleReferences).toHaveBeenCalledOnce()
    expect(bundle.meta?.profile?.[0]).toContain('TOC-Bundle')
    expect(document.content[0].attachment.url).toBe('https://example.test/fhir/Bundle/bundle-1')
    expect(composition).toBeDefined()
    expect(document.masterIdentifier).toEqual(composition?.identifier)
    expect(mocks.createBundle.mock.invocationCallOrder[0]).toBeLessThan(mocks.createDocumentReference.mock.invocationCallOrder[0])
  })

  it('does not remove the posted Bundle when DocumentReference creation fails', async () => {
    mocks.createDocumentReference.mockRejectedValue(new Error('Index write failed.'))
    await expect(createTocDocument(input)).rejects.toThrow('Index write failed.')
    expect(mocks.createBundle).toHaveBeenCalledOnce()
  })
})
