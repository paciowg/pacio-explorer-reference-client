/** Renders clinical summaries with consistent empty states and optional actions supplied by their owning patient section. */
import type { ReactNode } from 'react'
import type { Resource } from 'fhir/r4'
import type { ClinicalListItem } from './clinicalTypes'
import { ClinicalEntrySummary } from './ClinicalEntrySummary'
import { ExpandableFhirResource } from './FhirResourceDetails'

type ClinicalSummarySectionProps = {
  title: string
  items: ClinicalListItem[]
  emptyMessage?: string
  footer?: ReactNode
  baseUrl?: string
  renderItemActions?: (resource: Resource) => ReactNode
}

export function ClinicalSummarySection({
  title,
  items,
  emptyMessage = 'None recorded',
  footer,
  baseUrl,
  renderItemActions,
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
            item.resource ? (
              <ExpandableFhirResource
                key={`${item.resource.resourceType}-${item.resource.id || item.title}`}
                title={item.title}
                secondaryText={item.secondaryText}
                dateLabel={item.dateLabel}
                dateValue={item.dateValue}
                resource={item.resource}
                details={item.details || null}
                baseUrl={baseUrl}
                showResourceType={false}
                actions={renderItemActions?.(item.resource)}
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
