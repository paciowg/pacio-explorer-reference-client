/** Displays only the requested FHIR resource from the active server supplied by the app. */
import { PanelServerDetails } from '../../components/PanelServerDetails'
import { useEffect, useState } from 'react'
import type { Resource } from 'fhir/r4'
import { FhirJson } from '../../components/FhirJson'
import { readServerResource } from '../../lib/fhir/resourceTransport'

function ResourceContent({ baseUrl, reference }: { baseUrl: string; reference: string }) {
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

  return error ? <p className="error-banner" role="alert">{error}</p>
    : resource ? <FhirJson resource={resource} />
      : <p className="info-banner" role="status">Loading resource...</p>
}

export function FhirViewerPage({ baseUrl, serverLabel, resourceType, resourceId }: { baseUrl: string; serverLabel: string; resourceType: string; resourceId: string }) {
  return <section className="panel">
    <div className="panel-header">
      <h2>{resourceType}/{resourceId} FHIR JSON</h2>
      <PanelServerDetails label={serverLabel} baseUrl={baseUrl} />
    </div>
    <div className="fhir-viewer">
      <ResourceContent key={`${baseUrl}:${resourceType}/${resourceId}`} baseUrl={baseUrl} reference={`${resourceType}/${resourceId}`} />
    </div>
  </section>
}
