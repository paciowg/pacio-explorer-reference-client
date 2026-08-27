import type { Bundle, Resource } from 'fhir/r4'
import { normalizeBaseUrl } from './url'

export type BundleIndex = {
  resolve(reference: string | undefined, containingResource?: Resource): Resource | undefined
}

export function createBundleIndex(bundle: Bundle, baseUrl?: string): BundleIndex {
  const byFullUrl = new Map<string, Resource>()
  const byReference = new Map<string, Resource>()
  const normalizedBaseUrl = baseUrl ? normalizeBaseUrl(baseUrl) : undefined

  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource
    if (!resource) continue
    if (entry.fullUrl) byFullUrl.set(entry.fullUrl, resource)
    if (resource.id) byReference.set(`${resource.resourceType}/${resource.id}`, resource)
  }

  return {
    resolve(reference, containingResource) {
      if (!reference) return undefined
      if (reference.startsWith('#')) {
        const contained = (containingResource as Resource & { contained?: Resource[] } | undefined)
          ?.contained
        return contained?.find((resource) => `#${resource.id}` === reference)
      }
      if (byFullUrl.has(reference)) return byFullUrl.get(reference)
      if (byReference.has(reference)) return byReference.get(reference)
      if (!normalizedBaseUrl || !reference.startsWith(`${normalizedBaseUrl}/`)) return undefined
      return byReference.get(reference.slice(normalizedBaseUrl.length + 1))
    },
  }
}
