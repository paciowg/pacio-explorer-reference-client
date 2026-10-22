/** Checks the viewer's bounded device/document grouping, including contained and unavailable references. */
import { describe, expect, it, vi, afterEach } from 'vitest'
import type { Device, DeviceRequest, DeviceUseStatement, DocumentReference } from 'fhir/r4'
import { getRelatedFhirResources } from './relatedResources'
import { readServerResource } from '../../lib/fhir/resourceTransport'

const baseUrl = 'https://example.test/fhir'
const request: DeviceRequest = { resourceType: 'DeviceRequest', id: 'r', intent: 'order', subject: { reference: 'Patient/p' }, codeReference: { reference: 'Device/d' } }

afterEach(() => vi.unstubAllGlobals())

describe('viewer resource grouping', () => {
  it('groups a request with its referenced Device', () => {
    expect(getRelatedFhirResources(request, baseUrl)).toEqual([{ reference: 'Device/d', resource: undefined }])
  })
  it('groups usage with its Device and exposes contained Devices without a server read', () => {
    const device: Device = { resourceType: 'Device', id: 'd' }
    const usage: DeviceUseStatement = { resourceType: 'DeviceUseStatement', status: 'active', subject: { reference: 'Patient/p' }, device: { reference: '#d' }, contained: [device] }
    expect(getRelatedFhirResources(usage, baseUrl)).toEqual([{ reference: '#d', resource: device }])
    const externalUsage: DeviceUseStatement = { ...usage, device: { reference: `${baseUrl}/Device/d` } }
    expect(getRelatedFhirResources(externalUsage, baseUrl)[0].reference).toBe(`${baseUrl}/Device/d`)
  })
  it('does not invent a Device reference for coded requests or standalone Devices', () => {
    const codedRequest: DeviceRequest = { ...request, codeReference: undefined, codeCodeableConcept: { text: 'Walker' } }
    expect(getRelatedFhirResources(codedRequest, baseUrl)).toEqual([])
    expect(getRelatedFhirResources({ resourceType: 'Device', id: 'd' }, baseUrl)).toEqual([])
  })
  it('includes document Bundles only on the source server', () => {
    const document: DocumentReference = { resourceType: 'DocumentReference', status: 'current', content: [{ attachment: { url: `${baseUrl}/Bundle/b` } }] }
    expect(getRelatedFhirResources(document, baseUrl)[0].reference).toBe(`${baseUrl}/Bundle/b`)
    const externalDocument: DocumentReference = { ...document, content: [{ attachment: { url: 'https://other.test/Bundle/b' } }] }
    expect(getRelatedFhirResources(externalDocument, baseUrl)).toEqual([])
  })
  it('fetches the current primary resource and rejects external associated references before fetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(request)))
    vi.stubGlobal('fetch', fetchMock)
    const loaded = await readServerResource(baseUrl, 'DeviceRequest/r')
    expect(loaded).toEqual(request)
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/DeviceRequest/r`)
    await expect(readServerResource(baseUrl, 'https://other.test/Device/d')).rejects.toThrow('not on the selected server')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('reports a failed associated read without changing the primary resource', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(request)))
      .mockResolvedValueOnce(new Response('Missing', { status: 404 })))
    const loaded = await readServerResource(baseUrl, 'DeviceRequest/r')
    await expect(readServerResource(baseUrl, getRelatedFhirResources(loaded, baseUrl)[0].reference)).rejects.toThrow()
    expect(loaded).toEqual(request)
  })
})
