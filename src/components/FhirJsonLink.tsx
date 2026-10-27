/** Links readable clinical entries to the active server's FHIR JSON viewer in a separate tab. */
import type { Resource } from 'fhir/r4'
import { getRouteHref } from '../lib/routing/routes'

export function FhirJsonLink({ resource, baseUrl }: { resource?: Resource; baseUrl?: string }) {
  if (!resource?.id || !baseUrl) return null
  const path = `/fhir/${encodeURIComponent(resource.resourceType)}/${encodeURIComponent(resource.id)}`
  return <a className="fhir-json-link" href={getRouteHref(path)} target="_blank" rel="noopener noreferrer" aria-label={`View FHIR JSON for ${resource.resourceType}/${resource.id} (opens in a new tab)`}>
    View FHIR JSON <span aria-hidden="true">↗</span>
  </a>
}
