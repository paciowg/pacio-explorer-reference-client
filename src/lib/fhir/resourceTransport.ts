/** Provides generic resource writes, searches, and same-server reference reads without IG-specific rules. */
import type { Bundle, Resource } from 'fhir/r4'
import { normalizeBaseUrl } from './url'

async function parse(response: Response) {
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(body?.issue?.[0]?.diagnostics || body?.issue?.[0]?.details?.text || `FHIR request failed with status ${response.status}.`)
  return body
}

export async function searchResources(baseUrl: string, resourceType: string, parameters: Record<string, string> = {}): Promise<Bundle> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/${resourceType}?${new URLSearchParams({ _count: '200', ...parameters })}`, {
    cache: 'no-store', headers: { Accept: 'application/fhir+json' },
  })
  let bundle = await parse(response) as Bundle
  if (bundle?.resourceType !== 'Bundle') throw new Error(`The server did not return a ${resourceType} search Bundle.`)
  const entries = [...(bundle.entry ?? [])]
  let next = bundle.link?.find((link) => link.relation === 'next')?.url
  const base = new URL(`${normalizeBaseUrl(baseUrl)}/`)
  const basePath = base.pathname.replace(/\/+$/, '')
  const seen = new Set<string>()
  while (next && entries.length < 500) {
    const page = new URL(next, base)
    const url = page.href
    // HAPI places pagination queries directly on the FHIR base path, without a trailing slash.
    if (page.origin !== base.origin || (page.pathname !== basePath && !page.pathname.startsWith(`${basePath}/`)) || seen.has(url)) throw new Error('Unsupported resource-search pagination link.')
    seen.add(url)
    bundle = await parse(await fetch(url, { cache: 'no-store', headers: { Accept: 'application/fhir+json' } })) as Bundle
    if (bundle?.resourceType !== 'Bundle') throw new Error('The server did not return a search Bundle.')
    entries.push(...(bundle.entry ?? []))
    next = bundle.link?.find((link) => link.relation === 'next')?.url
  }
  return { resourceType: 'Bundle', type: 'searchset', entry: entries, ...(next ? { link: [{ relation: 'next', url: next }] } : {}) }
}

export function serverResourceUrl(baseUrl: string, reference: string): string {
  const base = normalizeBaseUrl(baseUrl)
  const relative = reference.startsWith(`${base}/`) ? reference.slice(base.length + 1) : reference.replace(/^\//, '')
  if (!/^[A-Z][A-Za-z]+\/[A-Za-z0-9.-]+(?:\/_history\/[A-Za-z0-9.-]+)?$/.test(relative)) throw new Error('Resource reference is not on the selected server.')
  return `${base}/${relative}`
}

export async function readServerResource(baseUrl: string, reference: string): Promise<Resource> {
  const url = serverResourceUrl(baseUrl, reference)
  const resource = await parse(await fetch(url, { cache: 'no-store', headers: { Accept: 'application/fhir+json' } })) as Resource
  const type = url.slice(normalizeBaseUrl(baseUrl).length + 1).split('/')[0]
  if (resource?.resourceType !== type) throw new Error(`The server did not return a ${type} resource.`)
  return resource
}

export async function createResource<T extends Resource>(baseUrl: string, resource: T): Promise<T> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/${resource.resourceType}`, {
    method: 'POST', cache: 'no-store', headers: { Accept: 'application/fhir+json', 'Content-Type': 'application/fhir+json', Prefer: 'return=representation' },
    body: JSON.stringify(resource),
  })
  const body = await parse(response) as T | null
  if (body?.resourceType === resource.resourceType && body.id) return body
  const location = response.headers.get('location') || response.headers.get('content-location') || ''
  const id = location.match(new RegExp(`(?:^|/)${resource.resourceType}/([^/?]+)(?:/_history/[^/?]+)?(?:[/?]|$)`))?.[1]
  if (!id) throw new Error(`The server accepted the ${resource.resourceType}, but did not return its id. Verify the destination before retrying.`)
  return { ...resource, id: decodeURIComponent(id) }
}

export class FhirUpdateError extends Error {
  readonly uncertain: boolean
  constructor(message: string, uncertain: boolean) { super(message); this.uncertain = uncertain }
}

/** Updates an existing identity without concurrency headers; callers must preserve fields outside their editing scope. */
export async function updateResource<T extends Resource>(baseUrl: string, resource: T): Promise<T> {
  if (!resource.id || !/^[A-Za-z0-9.-]{1,64}$/.test(resource.id)) throw new FhirUpdateError('An existing resource id is required for update.', false)
  const url = serverResourceUrl(baseUrl, `${resource.resourceType}/${resource.id}`)
  try {
    const response = await fetch(url, { method: 'PUT', cache: 'no-store',
      headers: { Accept: 'application/fhir+json', 'Content-Type': 'application/fhir+json', Prefer: 'return=representation' },
      body: JSON.stringify(resource) })
    const raw = await response.text()
    let body: T | { resourceType?: string; issue?: { diagnostics?: string; details?: { text?: string } }[] } | null
    try { body = raw ? JSON.parse(raw) : null }
    catch { throw new FhirUpdateError('The server returned an unreadable update response.', response.ok || response.status >= 500 || response.status === 408) }
    if (!response.ok) {
      const outcome = body as { issue?: { diagnostics?: string; details?: { text?: string } }[] } | null
      throw new FhirUpdateError(outcome?.issue?.[0]?.diagnostics || outcome?.issue?.[0]?.details?.text || `FHIR update failed (${response.status}).`, response.status >= 500 || response.status === 408)
    }
    // PUT already identifies the resource, so a successful empty response needs no Location header.
    if (!body || body.resourceType === 'OperationOutcome') return resource
    if (body.resourceType !== resource.resourceType || !('id' in body) || body.id !== resource.id) throw new FhirUpdateError('The server accepted the update but returned an unexpected resource identity.', true)
    return body as T
  } catch (error) {
    if (error instanceof FhirUpdateError) throw error
    throw new FhirUpdateError(error instanceof Error ? error.message : 'Update interrupted.', true)
  }
}
