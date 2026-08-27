import { describe, expect, it } from 'vitest'
import { createDocumentBundle } from './documents'

describe('createDocumentBundle', () => {
  it('preserves the supplied timestamp and entry order', () => {
    const compositionEntry = {
      fullUrl: 'urn:uuid:composition',
      resource: {
        resourceType: 'Composition' as const,
        status: 'final' as const,
        type: { text: 'PMO' },
        date: '2025-01-02T03:04:05.000Z',
        title: 'PMO',
        author: [{ reference: 'PractitionerRole/role-1' }],
      },
    }
    const supportingEntries = [
      { fullUrl: 'Binary/source-form', resource: { resourceType: 'Binary' as const } },
      { fullUrl: 'Patient/patient-1', resource: { resourceType: 'Patient' as const } },
    ]

    const bundle = createDocumentBundle({
      timestamp: '2025-01-02T03:04:05.000Z', compositionEntry, supportingEntries,
    })

    expect(bundle).toMatchObject({ resourceType: 'Bundle', type: 'document', timestamp: '2025-01-02T03:04:05.000Z' })
    expect(bundle.entry).toEqual([compositionEntry, ...supportingEntries])
  })
})
