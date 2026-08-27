import { describe, expect, it, vi } from 'vitest'

const { fetchResourceByReference } = vi.hoisted(() => ({ fetchResourceByReference: vi.fn() }))
vi.mock('./client', () => ({ fetchResourceByReference }))

import { closeBundleReferences } from './closedBundle'

describe('closeBundleReferences', () => {
  it('recursively closes references once and retains discovery order', async () => {
    fetchResourceByReference
      .mockResolvedValueOnce({ resourceType: 'Practitioner', id: 'practitioner-1' })
      .mockResolvedValueOnce({ resourceType: 'Patient', id: 'patient-1', generalPractitioner: [{ reference: 'Organization/org-1' }] })
      .mockResolvedValueOnce({ resourceType: 'Organization', id: 'org-1' })

    const closed = await closeBundleReferences('https://example.test/fhir', {
      resourceType: 'Bundle', type: 'document', entry: [{
        resource: {
          resourceType: 'Composition', status: 'final', type: { text: 'PMO' },
          date: '2025-01-01T00:00:00Z', title: 'PMO', author: [{ reference: 'Practitioner/practitioner-1' }],
          subject: { reference: 'Patient/patient-1' },
        },
      }],
    } as unknown as import('fhir/r4').Bundle)

    expect(fetchResourceByReference.mock.calls.map((call) => call[1])).toEqual([
      'Practitioner/practitioner-1', 'Patient/patient-1', 'Organization/org-1',
    ])
    expect(closed.entry?.map((entry) => entry.fullUrl)).toEqual([
      undefined, 'Practitioner/practitioner-1', 'Patient/patient-1', 'Organization/org-1',
    ])
  })

  it('preserves a failed referenced-resource error', async () => {
    fetchResourceByReference.mockRejectedValueOnce(new Error('Referenced resource was unavailable.'))

    await expect(closeBundleReferences('https://example.test/fhir', {
      resourceType: 'Bundle', type: 'document', entry: [{
        resource: {
          resourceType: 'Composition', status: 'final', type: { text: 'PMO' },
          date: '2025-01-01T00:00:00Z', title: 'PMO', author: [{ reference: 'Practitioner/practitioner-1' }],
        },
      }],
    } as unknown as import('fhir/r4').Bundle)).rejects.toThrow('Referenced resource was unavailable.')
  })
})
