/** Verifies device response-ID handling, OperationOutcome errors, pagination, and server-local reference boundaries. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDevice, createDeviceRequest, readServerResource, searchResources, serverResourceUrl } from './deviceTransport'

afterEach(() => vi.unstubAllGlobals())
const base = 'https://example.test/fhir'

describe('device transport', () => {
  it('uses representation responses and Location headers for created IDs', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ resourceType: 'Device', id: 'device' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201, headers: { Location: `${base}/DeviceRequest/request/_history/1` } }))
    vi.stubGlobal('fetch', fetchMock)
    expect((await createDevice(base, { resourceType: 'Device' })).id).toBe('device')
    expect((await createDeviceRequest(base, { resourceType: 'DeviceRequest', intent: 'order', subject: { reference: 'Patient/p' } })).id).toBe('request')
    expect(fetchMock.mock.calls[0][1].headers.Prefer).toBe('return=representation')
  })
  it('reports OperationOutcome rejection and successful responses with missing IDs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ issue: [{ diagnostics: 'Profile validation failed' }] }), { status: 422 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 })))
    await expect(createDevice(base, { resourceType: 'Device' })).rejects.toThrow('Profile validation failed')
    await expect(createDevice(base, { resourceType: 'Device' })).rejects.toThrow('accepted')
  })
  it('accepts local historical references and rejects external or malformed references before fetching', async () => {
    expect(serverResourceUrl(base, 'Device/a/_history/2')).toBe(`${base}/Device/a/_history/2`)
    expect(serverResourceUrl(base, `${base}/Device/a`)).toBe(`${base}/Device/a`)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const ref of ['https://other.test/Device/a', `${base}.evil/Device/a`, '#contained', 'Device/../Patient/a', 'urn:uuid:a']) {
      await expect(readServerResource(base, ref)).rejects.toThrow('selected server')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('follows same-server search pages and rejects external page links', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ resourceType: 'Bundle', type: 'searchset', entry: [{ resource: { resourceType: 'Organization', id: 'a' } }], link: [{ relation: 'next', url: `${base}/Organization?page=2` }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ resourceType: 'Bundle', type: 'searchset', entry: [{ resource: { resourceType: 'Organization', id: 'b' } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ resourceType: 'Bundle', type: 'searchset', link: [{ relation: 'next', url: 'https://other.test/Organization?page=2' }] })))
    vi.stubGlobal('fetch', fetchMock)
    expect((await searchResources(base, 'Organization')).entry).toHaveLength(2)
    await expect(searchResources(base, 'Organization')).rejects.toThrow('pagination')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
  it.each([`${base}?_getpages=search&_getpagesoffset=200`, '/fhir?_getpages=search&_getpagesoffset=200', '?_getpages=search&_getpagesoffset=200'])(
    'follows base-path pagination links: %s', async (next) => {
      const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ resourceType: 'Bundle', type: 'searchset', entry: [{ resource: { resourceType: 'Organization', id: 'a' } }], link: [{ relation: 'next', url: next }] })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ resourceType: 'Bundle', type: 'searchset', entry: [{ resource: { resourceType: 'Organization', id: 'b' } }] })))
      vi.stubGlobal('fetch', fetchMock)
      expect((await searchResources(`${base}/`, 'Organization')).entry?.map((entry) => entry.resource?.id)).toEqual(['a', 'b'])
      expect(fetchMock.mock.calls[1][0]).toBe(new URL(next, `${base}/`).href)
    },
  )
  it.each(['https://other.test/fhir?page=2', 'http://example.test/fhir?page=2', `${base}-other?page=2`, `${base}/../other?page=2`])(
    'rejects pagination outside the selected FHIR base: %s', async (next) => {
      const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ resourceType: 'Bundle', type: 'searchset', link: [{ relation: 'next', url: next }] })))
      vi.stubGlobal('fetch', fetchMock)
      await expect(searchResources(base, 'Organization')).rejects.toThrow('Unsupported resource-search pagination link.')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )
  it('rejects repeated pagination links before fetching the same page again', async () => {
    const bundle = { resourceType: 'Bundle', type: 'searchset', link: [{ relation: 'next', url: `${base}?_getpages=search&_getpagesoffset=200` }] }
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(bundle))))
    vi.stubGlobal('fetch', fetchMock)
    await expect(searchResources(base, 'Organization')).rejects.toThrow('Unsupported resource-search pagination link.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
