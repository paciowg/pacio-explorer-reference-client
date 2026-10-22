/** Renders accessible clinical disclosures with raw FHIR links available inside the expanded content. */
import type { Resource } from 'fhir/r4'
import type { ResourceDetailModel } from '../lib/fhir/resourceDetails'
import { ClinicalEntrySummary, type ClinicalEntrySummaryProps } from './ClinicalEntrySummary'
import { FhirJsonLink } from './FhirJsonLink'

type ExpandableFhirResourceProps = Omit<ClinicalEntrySummaryProps, 'resourceType' | 'showDisclosure'> & {
  resource: Resource
  details: ResourceDetailModel | null
  showResourceType?: boolean
  baseUrl?: string
}

export function FhirResourceDetails({ model }: { model: ResourceDetailModel }) {
  return (
    <div className="fhir-resource-details">
      {model.groups.map((detailGroup, groupIndex) => (
        <section key={`${detailGroup.title || 'details'}-${groupIndex}`} className="fhir-detail-group">
          {detailGroup.title ? <h4>{detailGroup.title}</h4> : null}
          <dl className="fhir-detail-grid">
            {detailGroup.fields.map((detailField) => (
              <div
                key={`${detailField.label}-${detailField.values.join('|')}`}
                className={detailField.multiline ? 'fhir-detail-field-multiline' : undefined}
              >
                <dt>{detailField.label}</dt>
                <dd>
                  {detailField.values.length === 1 ? detailField.values[0] : (
                    <ul>
                      {detailField.values.map((value, valueIndex) => (
                        <li key={`${value}-${valueIndex}`}>{value}</li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

export function ExpandableFhirResource(props: ExpandableFhirResourceProps) {
  const summaryProps = {
    title: props.title,
    secondaryText: props.secondaryText,
    dateLabel: props.dateLabel,
    dateValue: props.dateValue,
    resourceType: props.showResourceType === false ? undefined : props.resource.resourceType,
  }

  const hasJsonLink = Boolean(props.resource.id && props.baseUrl)
  if (!props.details && !hasJsonLink) {
    return (
      <li className="clinical-list-item">
        <ClinicalEntrySummary {...summaryProps} />
      </li>
    )
  }

  return (
    <li className="clinical-list-item clinical-list-expandable-item">
      <details className="clinical-entry-disclosure">
        <summary>
          <ClinicalEntrySummary {...summaryProps} showDisclosure />
        </summary>
        {props.details ? <FhirResourceDetails model={props.details} /> : null}
        {hasJsonLink ? <div className="fhir-resource-actions">
          <FhirJsonLink resource={props.resource} baseUrl={props.baseUrl} />
        </div> : null}
      </details>
    </li>
  )
}
