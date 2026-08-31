/** Presents an exact FHIR resource type consistently in compact clinical lists. */
type FhirResourceTypeBadgeProps = { resourceType: string }

export function FhirResourceTypeBadge({ resourceType }: FhirResourceTypeBadgeProps) {
  return <span className="fhir-resource-type-badge">{resourceType}</span>
}
