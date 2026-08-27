/** Normalizes user-provided FHIR base URLs for stable comparison and request construction. */
export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '')
}
