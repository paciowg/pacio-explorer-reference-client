/** Renders the shared collapsed content for static, navigable, and expandable clinical entries. */
import { FhirResourceTypeBadge } from './FhirResourceTypeBadge'

export type ClinicalEntrySummaryProps = {
  title: string
  secondaryText?: string
  dateLabel?: string
  dateValue?: string
  resourceType?: string
  showDisclosure?: boolean
}

export function ClinicalEntrySummary(props: ClinicalEntrySummaryProps) {
  return (
    <>
      {props.showDisclosure ? (
        <span className="clinical-entry-chevron" aria-hidden="true">›</span>
      ) : null}
      <span className="clinical-list-main">
        <span className="toc-option-title-row">
          <span className="clinical-item-title">{props.title}</span>
          {props.resourceType ? <FhirResourceTypeBadge resourceType={props.resourceType} /> : null}
        </span>
        {props.secondaryText ? (
          <span className="clinical-item-secondary">{props.secondaryText}</span>
        ) : null}
      </span>
      <span className="clinical-item-meta">
        {props.dateLabel ? <span className="clinical-item-date-label">{props.dateLabel}</span> : null}
        <span className="clinical-item-date-value">{props.dateValue || '--'}</span>
      </span>
    </>
  )
}
