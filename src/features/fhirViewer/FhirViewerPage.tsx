/** Reads current FHIR resources from the link's source server, isolating failures for associated resources. */
import { useEffect, useState } from 'react'
import type { Resource } from 'fhir/r4'
import { FhirJson } from '../../components/FhirJson'
import { readServerResource } from '../../lib/fhir/resourceTransport'
import { getRelatedFhirResources } from './relatedResources'

function ResourcePanel({ baseUrl, reference, includeRelated = false }: { baseUrl: string; reference: string; includeRelated?: boolean }) {
  const [resource, setResource] = useState<Resource | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let mounted = true
    setResource(null)
    setError('')
    void readServerResource(baseUrl, reference).then(
      (result) => { if (mounted) setResource(result) },
      (cause: unknown) => { if (mounted) setError(cause instanceof Error ? cause.message : 'Unable to load resource.') },
    )
    return () => { mounted = false }
  }, [baseUrl, reference])

  return <>
    <section className="summary-card fhir-json-card">
      <h3>{reference}</h3>
      {error ? <p className="error-banner" role="alert">{error}</p>
        : resource ? <FhirJson resource={resource} />
          : <p className="info-banner" role="status">Loading resource...</p>}
    </section>
    {includeRelated && resource ? getRelatedFhirResources(resource, baseUrl).map((related) => related.resource
      ? <section className="summary-card fhir-json-card" key={related.reference}>
        <h3>{related.resource.resourceType} ({related.reference}, contained)</h3>
        <FhirJson resource={related.resource} />
      </section>
      : <ResourcePanel key={related.reference} baseUrl={baseUrl} reference={related.reference} />) : null}
  </>
}

export function FhirViewerPage({ baseUrl, resourceType, resourceId }: { baseUrl: string; resourceType: string; resourceId: string }) {
  return <section className="panel">
    <div className="panel-header">
      <h2>FHIR JSON</h2>
      <span className="panel-server-url">{baseUrl}</span>
    </div>
    <div className="summary-preview-panel full-width-panel fhir-viewer">
      <ResourcePanel key={`${baseUrl}:${resourceType}/${resourceId}`} baseUrl={baseUrl} reference={`${resourceType}/${resourceId}`} includeRelated />
    </div>
  </section>
}
