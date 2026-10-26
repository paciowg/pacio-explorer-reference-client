/** Verifies destination identity decisions, portable publication, retained writes, and uncertain-result protection. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Bundle, List, Patient, Resource } from 'fhir/r4'
import { SMP_BUNDLE } from '../../igs/pacioSmp/smp'
import { matchSmpPatient, publishSmpCollection, writeSmpResource, type SmpProgress } from './smpPublishing'
import type { PreparedSnapshot } from './smpReferences'

const source = 'https://source.test/fhir', destination = 'https://destination.test/fhir'
const patient: Patient = { resourceType: 'Patient', id: 'p', identifier: [{ system: 'urn:test', value: '123' }], name: [{ family: 'Example', given: ['Pat'] }] }
const bundle: Bundle = { resourceType: 'Bundle', meta: { profile: [SMP_BUNDLE] }, type: 'collection', identifier: { system: 'urn:ietf:rfc:3986', value: 'urn:uuid:5c41a001-5555-4444-8888-555555555555' }, timestamp: '2026-10-26T12:00:00Z', entry: [{ resource: { resourceType: 'List', id: 'l', status: 'current', mode: 'snapshot', source: { reference: 'urn:uuid:role' } } as List }] }
const snapshot: PreparedSnapshot = { patient, bundle, originals: new Map([['List/l', { resourceType: 'List', id: 'l', status: 'current', mode: 'snapshot' } as Resource]]) }
const response = (body: unknown, status = 200, headers?: Record<string, string>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/fhir+json', ...headers } })
const capability = { resourceType: 'CapabilityStatement', fhirVersion: '4.0.1' }
afterEach(() => vi.unstubAllGlobals())

describe('SMP patient matching', () => {
  it('uses unique identifier matches and never writes during review', async () => {
    const fetch = vi.fn(async (url: string, _options?: RequestInit) => response(url.endsWith('/metadata') ? capability : { resourceType: 'Bundle', type: 'searchset', entry: [{ resource: { ...patient, id: 'd' } }] }))
    vi.stubGlobal('fetch', fetch)
    expect((await matchSmpPatient(source, destination, patient)).patient?.id).toBe('d')
    expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true)
  })
  it('requires explicit name selection, blocks ambiguity, and propagates failed searches', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/metadata') ? capability : { resourceType: 'Bundle', type: 'searchset', entry: url.includes('identifier=') ? [] : [{ resource: { ...patient, id: 'name' } }] })))
    const match = await matchSmpPatient(source, destination, patient)
    expect(match.patient).toBeUndefined()
    expect(match.nameCandidate?.id).toBe('name')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/metadata') ? capability : { resourceType: 'Bundle', type: 'searchset', entry: [{ resource: patient }, { resource: { ...patient, id: 'other' } }] })))
    await expect(matchSmpPatient(source, destination, patient)).rejects.toThrow('ambiguous')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/metadata') ? capability : { issue: [{ diagnostics: 'search failed' }] }, url.endsWith('/metadata') ? 200 : 500)))
    await expect(matchSmpPatient(source, destination, patient)).rejects.toThrow('search failed')
  })
})

describe('SMP publication', () => {
  it('retains the Bundle after a definite index rejection and retries only the index', async () => {
    let indexes = 0
    const fetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (!options?.method) return response(snapshot.originals.get('List/l'))
      const body = JSON.parse(options.body as string)
      if (url.endsWith('/DocumentReference') && indexes++ === 0) return response({ issue: [{ diagnostics: 'Index rejected' }] }, 422)
      return response({ ...body, id: body.resourceType === 'Bundle' ? 'b' : 'index' }, 201)
    })
    vi.stubGlobal('fetch', fetch)
    const progress: SmpProgress = {}
    const input = { sourceBase: source, destinationBase: destination, title: 'Medication collection', snapshot, match: { patient: { ...patient, id: 'd' }, warning: '' }, acceptName: false }
    await expect(publishSmpCollection(input, progress)).rejects.toThrow('Index rejected')
    expect(progress.bundle?.id).toBe('b')
    expect(progress.uncertain).toBeUndefined()
    await expect(publishSmpCollection({ ...input, destinationBase: 'https://another.test/fhir' }, progress)).rejects.toThrow('inputs changed')
    await publishSmpCollection(input, progress)
    const posts = fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST')
    expect(posts.filter(([url]) => url.endsWith('/Bundle'))).toHaveLength(1)
    const indexed = JSON.parse(posts.at(-1)![1]!.body as string)
    expect(indexed.subject.reference).toBe('Patient/d')
    expect(indexed.content[0].attachment.url).toBe(`${destination}/Bundle/b`)
    expect(indexed.author).toBeUndefined()
    expect(indexed.masterIdentifier).toEqual(bundle.identifier)
  })
  it('copies a Patient only on submission and never posts embedded resources independently', async () => {
    const fetch = vi.fn(async (_url: string, opts?: RequestInit) => {
      if (!opts?.method) return response(snapshot.originals.get('List/l'))
      return response({ ...JSON.parse(opts.body as string), id: 'created' }, 201)
    })
    vi.stubGlobal('fetch', fetch)
    const progress: SmpProgress = {}
    await publishSmpCollection({ sourceBase: source, destinationBase: destination, title: 'Snapshot', snapshot, match: { warning: '' }, acceptName: false }, progress)
    const writes = fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST')
    expect(writes.map(([url]) => url.split('/').at(-1))).toEqual(['Patient', 'Bundle', 'DocumentReference'])
    expect(JSON.parse(writes[0][1]!.body as string).id).toBeUndefined()
  })
  it('blocks retries after a 500 or interrupted write', async () => {
    const fetch = vi.fn(async (_url: string, options?: RequestInit) => options?.method ? response({ issue: [{ diagnostics: 'commit status unknown' }] }, 500) : response(snapshot.originals.get('List/l')))
    vi.stubGlobal('fetch', fetch)
    const progress: SmpProgress = {}
    const input = { sourceBase: source, destinationBase: destination, title: 'Snapshot', snapshot, match: { patient, warning: '' }, acceptName: false }
    await expect(publishSmpCollection(input, progress)).rejects.toThrow('commit status unknown')
    expect(progress.uncertain).toBe('Bundle')
    const count = fetch.mock.calls.length
    await expect(publishSmpCollection(input, progress)).rejects.toThrow('uncertain')
    expect(fetch).toHaveBeenCalledTimes(count)
  })
  it('accepts same-server Location identities and treats missing/foreign ids as uncertain', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 201, headers: { Location: `${destination}/Bundle/b/_history/1` } })))
    expect((await writeSmpResource(destination, bundle)).id).toBe('b')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 201, headers: { Location: 'https://foreign.test/Bundle/b' } })))
    await expect(writeSmpResource(destination, bundle)).rejects.toMatchObject({ uncertain: true })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(writeSmpResource(destination, bundle)).rejects.toMatchObject({ uncertain: true })
  })
})
