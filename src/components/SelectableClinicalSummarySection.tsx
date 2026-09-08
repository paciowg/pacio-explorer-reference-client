/** Renders clinical-summary items that can navigate to a resource-specific detail view. */
import type { ReactNode } from 'react'
import type { SelectableClinicalListItem } from './clinicalTypes'
import { ClinicalEntrySummary } from './ClinicalEntrySummary'

type SelectableClinicalSummarySectionProps = {
  title: string
  items: SelectableClinicalListItem[]
  emptyMessage?: string
  footer?: ReactNode
  onSelect: (item: SelectableClinicalListItem) => void
}

export function SelectableClinicalSummarySection({
  title,
  items,
  emptyMessage = 'None recorded',
  footer,
  onSelect,
}: SelectableClinicalSummarySectionProps) {
  return (
    <section className="summary-card clinical-summary-card">
      <div className="clinical-summary-header">
        <h3>{title}</h3>
        <span className="clinical-summary-cap">Up to 10 items</span>
      </div>

      {items.length > 0 ? (
        <ul className="clinical-list">
          {items.map((item) => (
            <li key={`${title}-${item.id}`} className="clinical-list-selectable-item">
              <button
                type="button"
                className="clinical-select-button"
                onClick={() => onSelect(item)}
              >
                <ClinicalEntrySummary
                  title={item.title}
                  secondaryText={item.secondaryText}
                  dateLabel={item.dateLabel}
                  dateValue={item.dateValue}
                />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">{emptyMessage}</p>
      )}

      {footer ? <div className="clinical-section-footer">{footer}</div> : null}
    </section>
  )
}
