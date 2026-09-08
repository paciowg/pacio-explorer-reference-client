/** Renders a reusable, accessible disclosure for clinically useful FHIR resource details. */
import type { Resource } from 'fhir/r4'
import type { ResourceDetailModel } from '../lib/fhir/resourceDetails'
import { ClinicalEntrySummary, type ClinicalEntrySummaryProps } from './ClinicalEntrySummary'

type ExpandableFhirResourceProps = Omit<ClinicalEntrySummaryProps, 'resourceType' | 'showDisclosure'> & {
  resource: Resource
  details: ResourceDetailModel | null
  showResourceType?: boolean
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

  if (!props.details) {
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
        <FhirResourceDetails model={props.details} />
      </details>
    </li>
  )
}
