import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBundle,
  createDocumentReference,
  fetchBundleByReference,
  fetchPatientEverything,
  validateFhirServer,
} from './client'
import type { Bundle, DocumentReference } from 'fhir/r4'

function response(body: unknown, options: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/fhir+json' },
    ...options,
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('FHIR transport', () => {
  it('uses normalized URLs and FHIR headers, and reports OperationOutcome errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ resourceType: 'CapabilityStatement', fhirVersion: '4.0.1' }))
      .mockResolvedValueOnce(response({ issue: [{ diagnostics: 'Denied by server' }] }, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(validateFhirServer(' https://example.test/fhir/ ')).resolves.toMatchObject({
      fhirVersion: '4.0.1',
    })
    await expect(fetchBundleByReference('https://example.test/fhir', 'Bundle/blocked')).rejects.toThrow(
      'Denied by server',
    )

    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/fhir/metadata')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: 'no-store', headers: { Accept: 'application/fhir+json, application/json' },
    })
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.test/fhir/Bundle/blocked')
  })

  it('merges paginated $everything responses and stops at the requested maximum', async () => {
    const first: Bundle = {
      resourceType: 'Bundle', type: 'searchset', entry: [
        { resource: { resourceType: 'Patient', id: 'patient-1' } },
        { resource: { resourceType: 'Condition', id: 'condition-1' } },
      ], link: [{ relation: 'next', url: 'https://example.test/fhir/page-2' }],
    }
    const second: Bundle = {
      resourceType: 'Bundle', type: 'searchset', entry: [
        { resource: { resourceType: 'Condition', id: 'condition-1' } },
        { resource: { resourceType: 'Observation', id: 'observation-1' } },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(second))
    vi.stubGlobal('fetch', fetchMock)

    const bundle = await fetchPatientEverything('https://example.test/fhir/', 'patient-1', {
      maxResults: 3, pageCount: 2,
    })

    expect(fetchMock.mock.calls[0][0]).toContain('/Patient/patient-1/$everything?')
    expect(fetchMock.mock.calls[0][0]).toContain('_count=2')
    expect(fetchMock.mock.calls[0][0]).toContain('_include=*')
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.test/fhir/page-2')
    expect(bundle.entry?.map((entry) => `${entry.resource?.resourceType}/${entry.resource?.id}`)).toEqual([
      'Patient/patient-1', 'Condition/condition-1', 'Observation/observation-1',
    ])
    expect(bundle.total).toBe(3)
  })

  it('rejects external Bundle references and posts PMO resources in the supplied order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => response({ resourceType: 'Bundle', id: 'bundle-1' })),
    )
    await expect(fetchBundleByReference('https://example.test/fhir', 'https://other.test/Bundle/1')).rejects.toThrow(
      'Unsupported external Bundle reference',
    )

    const bundle: Bundle = { resourceType: 'Bundle', type: 'document' }
    const documentReference: DocumentReference = {
      resourceType: 'DocumentReference', status: 'current', content: [],
    }
    await createBundle('https://example.test/fhir/', bundle)
    await createDocumentReference('https://example.test/fhir/', documentReference)

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock.mock.calls.map(([url, options]) => [url, options.method, options.headers['Content-Type'], options.body])).toEqual([
      ['https://example.test/fhir/Bundle', 'POST', 'application/fhir+json', JSON.stringify(bundle)],
      ['https://example.test/fhir/DocumentReference', 'POST', 'application/fhir+json', JSON.stringify(documentReference)],
    ])
  })
})
