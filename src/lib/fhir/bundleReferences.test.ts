/** Verifies reference discovery and conversion of closed Bundle references to UUID URNs. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Composition } from 'fhir/r4'
import { withUrnUuidBundleReferences } from './bundleReferences'

afterEach(() => vi.unstubAllGlobals())

describe('withUrnUuidBundleReferences', () => {
  it('assigns deterministic URNs and rewrites nested internal references', () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('composition-uuid')
      .mockReturnValueOnce('patient-uuid')
    vi.stubGlobal('crypto', { randomUUID })

    const bundle = withUrnUuidBundleReferences({
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        {
          fullUrl: 'Composition/composition-1',
          resource: {
            resourceType: 'Composition',
            id: 'composition-1',
            status: 'final',
            type: { text: 'PMO' },
            date: '2025-01-01',
            title: 'PMO',
            author: [{ reference: 'Patient/patient-1' }],
            subject: { reference: 'Patient/patient-1' },
          } as Composition,
        },
        {
          fullUrl: 'Patient/patient-1',
          resource: { resourceType: 'Patient', id: 'patient-1' },
        },
      ],
    })

    expect(bundle.entry?.map((entry) => entry.fullUrl)).toEqual([
      'urn:uuid:composition-uuid',
      'urn:uuid:patient-uuid',
    ])
    expect(bundle.entry?.[0].resource).toMatchObject({
      author: [{ reference: 'urn:uuid:patient-uuid' }],
      subject: { reference: 'urn:uuid:patient-uuid' },
    })
  })
})
