/** Verifies identity-preserving PUT requests and distinguishes definite update rejections from uncertain outcomes. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { externalMedicationStatement } from '../../test/fixtures/externalMedicationStatement'
import { FhirUpdateError, updateResource } from './resourceTransport'

const base = 'https://source.test/fhir'
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/fhir+json' } })
afterEach(() => vi.unstubAllGlobals())

describe('resource updates', () => {
  it('PUTs the full original identity without If-Match or client-generated metadata', async () => {
    const returned = { ...externalMedicationStatement, meta: { ...externalMedicationStatement.meta, versionId: 'server-new-version' } }
    const fetch = vi.fn(async () => json(returned))
    vi.stubGlobal('fetch', fetch)
    const saved = await updateResource(`${base}/`, externalMedicationStatement)
    const [url, init] = (fetch.mock.calls as unknown as [string, RequestInit][])[0]
    expect(url).toBe(`${base}/MedicationStatement/external-statement`)
    expect(init.method).toBe('PUT')
    expect(new Headers(init.headers).has('If-Match')).toBe(false)
    expect(JSON.parse(init.body as string)).toEqual(externalMedicationStatement)
    expect(saved.meta?.versionId).toBe('server-new-version')
    expect(fetch).toHaveBeenCalledOnce()
  })
  it.each([200, 204])('accepts a successful empty %s response without a Location header', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status })))
    expect(await updateResource(base, externalMedicationStatement)).toEqual(externalMedicationStatement)
  })
  it.each([400, 403, 404, 422])('reports a definite %s rejection with the server message', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ resourceType: 'OperationOutcome', issue: [{ diagnostics: 'Update rejected' }] }, status)))
    await expect(updateResource(base, externalMedicationStatement)).rejects.toMatchObject({ message: 'Update rejected', uncertain: false })
  })
  it.each([408, 500, 503])('treats %s as uncertain without retrying', async (status) => {
    const fetch = vi.fn(async () => json({}, status))
    vi.stubGlobal('fetch', fetch)
    await expect(updateResource(base, externalMedicationStatement)).rejects.toMatchObject({ uncertain: true })
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('treats interruptions, malformed successful responses, and unexpected identities as uncertain', async () => {
    for (const response of [() => { throw new TypeError('Connection lost') }, () => new Response('{'), () => json({ resourceType: 'MedicationStatement', id: 'different' })]) {
      vi.stubGlobal('fetch', vi.fn(async () => response()))
      await expect(updateResource(base, externalMedicationStatement)).rejects.toMatchObject({ uncertain: true })
    }
  })
  it('requires a valid existing identity before sending a write', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(updateResource(base, { ...externalMedicationStatement, id: undefined })).rejects.toBeInstanceOf(FhirUpdateError)
    await expect(updateResource(base, { ...externalMedicationStatement, id: '../other' })).rejects.toMatchObject({ uncertain: false })
    expect(fetch).not.toHaveBeenCalled()
  })
})
