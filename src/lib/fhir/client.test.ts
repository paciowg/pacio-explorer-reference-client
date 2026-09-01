/** Verifies FHIR transport headers, validation, pagination, reference safety, and error reporting. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBundle,
  createDocumentReference,
  createPatient,
  fetchBundleByReference,
  fetchPatientEverything,
  fetchQuestionnaire,
  getServerLocalQuestionnaireId,
  searchPatients,
  validateFhirServer,
} from './client'
import type { Bundle, DocumentReference, Patient, Questionnaire } from 'fhir/r4'

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

  it('encodes Patient searches and reads created Patient ids from response or location', async () => {
    const createdPatient: Patient = { resourceType: 'Patient', id: 'patient-2' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ resourceType: 'Bundle', type: 'searchset' }))
      .mockResolvedValueOnce(response(createdPatient, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, {
        status: 201,
        headers: {
          'content-type': 'application/fhir+json',
          Location: 'https://example.test/fhir/Patient/patient-3/_history/1',
        },
      }))
    vi.stubGlobal('fetch', fetchMock)

    await searchPatients('https://example.test/fhir', {
      identifier: 'https://example.test/mrn|12345',
    })
    await expect(createPatient('https://example.test/fhir', {
      resourceType: 'Patient', name: [{ text: 'Ada Lovelace' }],
    })).resolves.toEqual(createdPatient)
    await expect(createPatient('https://example.test/fhir', {
      resourceType: 'Patient', name: [{ text: 'Grace Hopper' }],
    })).resolves.toMatchObject({ id: 'patient-3', name: [{ text: 'Grace Hopper' }] })

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.test/fhir/Patient?_count=100&identifier=https%3A%2F%2Fexample.test%2Fmrn%7C12345',
    )
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Prefer: 'return=representation' }),
    })
  })

  it('rejects Patient creation when the destination returns no Patient id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 201 })))

    await expect(createPatient('https://example.test/fhir', {
      resourceType: 'Patient', name: [{ text: 'Ada Lovelace' }],
    })).rejects.toThrow('The server did not return an id for the created Patient.')
  })

  it('reads only server-local Questionnaire canonicals', async () => {
    expect(getServerLocalQuestionnaireId('https://example.test/fhir/', 'Questionnaire/gad-7')).toBe('gad-7')
    expect(getServerLocalQuestionnaireId('https://example.test/fhir', 'https://example.test/fhir/Questionnaire/gad-7|2.0')).toBe('gad-7')
    expect(getServerLocalQuestionnaireId('https://example.test/fhir', 'https://other.test/Questionnaire/gad-7')).toBeNull()
    expect(getServerLocalQuestionnaireId('https://example.test/fhir', 'https://example.test/Questionnaire/gad-7')).toBeNull()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      resourceType: 'Questionnaire', id: 'gad-7', status: 'active', title: 'GAD-7',
    } satisfies Questionnaire)))
    await expect(fetchQuestionnaire('https://example.test/fhir', 'gad-7')).resolves.toMatchObject({ id: 'gad-7' })
    expect(fetch).toHaveBeenCalledWith('https://example.test/fhir/Questionnaire/gad-7', expect.objectContaining({
      cache: 'no-store',
    }))
  })
})
