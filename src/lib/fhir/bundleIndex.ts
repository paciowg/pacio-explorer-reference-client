/** Indexes a FHIR Bundle for safe resolution of contained, relative, and same-server references. */
import type { Bundle, Resource } from 'fhir/r4'
import { normalizeBaseUrl } from './url'

export type BundleIndex = {
  resolve(reference: string | undefined, containingResource?: Resource): Resource | undefined
}

/**
 * Resolves references only against resources already present in the Bundle.
 * Absolute references are accepted only when they belong to the configured FHIR server.
 */
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
        // Fragment references are scoped to the resource that contains them, not the whole Bundle.
        const contained = (containingResource as Resource & { contained?: Resource[] } | undefined)
          ?.contained
        return contained?.find((resource) => `#${resource.id}` === reference)
      }
      const isAbsoluteReference = reference.startsWith('http://') || reference.startsWith('https://')
      if (
        isAbsoluteReference &&
        (!normalizedBaseUrl || !reference.startsWith(`${normalizedBaseUrl}/`))
      ) {
        return undefined
      }
      if (byFullUrl.has(reference)) return byFullUrl.get(reference)
      if (byReference.has(reference)) return byReference.get(reference)
      if (!normalizedBaseUrl || !reference.startsWith(`${normalizedBaseUrl}/`)) return undefined
      return byReference.get(reference.slice(normalizedBaseUrl.length + 1))
    },
  }
}
