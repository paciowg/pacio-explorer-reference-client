/** Renders a read-only clinical-summary list with consistent empty and unavailable states. */
import type { ReactNode } from 'react'
import type { ClinicalListItem } from './clinicalTypes'
import { ClinicalEntrySummary } from './ClinicalEntrySummary'
import { ExpandableFhirResource } from './FhirResourceDetails'

type ClinicalSummarySectionProps = {
  title: string
  items: ClinicalListItem[]
  emptyMessage?: string
  footer?: ReactNode
}

export function ClinicalSummarySection({
  title,
  items,
  emptyMessage = 'None recorded',
  footer,
}: ClinicalSummarySectionProps) {
  return (
    <section className="summary-card clinical-summary-card">
      <div className="clinical-summary-header">
        <h3>{title}</h3>
        <span className="clinical-summary-cap">Up to 10 items</span>
      </div>

      {items.length > 0 ? (
        <ul className="clinical-list">
          {items.map((item) => (
            item.resource && item.details ? (
              <ExpandableFhirResource
                key={`${item.resource.resourceType}-${item.resource.id || item.title}`}
                title={item.title}
                secondaryText={item.secondaryText}
                dateLabel={item.dateLabel}
                dateValue={item.dateValue}
                resource={item.resource}
                details={item.details}
                showResourceType={false}
              />
            ) : (
              <li
                key={`${title}-${item.title}-${item.dateValue ?? ''}-${item.secondaryText ?? ''}`}
                className="clinical-list-item"
              >
                <ClinicalEntrySummary
                  title={item.title}
                  secondaryText={item.secondaryText}
                  dateLabel={item.dateLabel}
                  dateValue={item.dateValue}
                />
              </li>
            )
          ))}
        </ul>
      ) : (
        <p className="empty-state">{emptyMessage}</p>
      )}

      {footer ? <div className="clinical-section-footer">{footer}</div> : null}
    </section>
  )
}
