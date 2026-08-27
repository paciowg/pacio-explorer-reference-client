import { describe, expect, it } from 'vitest'
import { createBundleIndex } from './bundleIndex'

describe('createBundleIndex', () => {
  const bundle = {
    resourceType: 'Bundle' as const,
    type: 'collection' as const,
    entry: [
      { fullUrl: 'urn:uuid:binary', resource: { resourceType: 'Binary' as const, id: 'binary-1' } },
      { resource: { resourceType: 'Patient' as const, id: 'patient-1' } },
    ],
  }

  it('resolves full URLs, relative references, and same-server absolute references', () => {
    const index = createBundleIndex(bundle, 'https://example.test/fhir/')
    expect(index.resolve('urn:uuid:binary')?.id).toBe('binary-1')
    expect(index.resolve('Patient/patient-1')?.id).toBe('patient-1')
    expect(index.resolve('https://example.test/fhir/Patient/patient-1')?.id).toBe('patient-1')
    expect(index.resolve('https://external.test/Patient/patient-1')).toBeUndefined()
  })

  it('scopes contained references to their containing resource', () => {
    const first = { resourceType: 'Composition' as const, contained: [{ resourceType: 'Binary' as const, id: 'same-id' }] }
    const second = { resourceType: 'DocumentReference' as const, status: 'current' as const, content: [], contained: [{ resourceType: 'Binary' as const, id: 'same-id' }] }
    const index = createBundleIndex(bundle)
    expect(index.resolve('#same-id', first)).toBe(first.contained[0])
    expect(index.resolve('#same-id', second)).toBe(second.contained[0])
    expect(index.resolve('#same-id')).toBeUndefined()
  })
})
