/** Verifies Patient clinical lists reuse collapsed summaries while reserving disclosures for clinical resources. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ClinicalSummarySection } from './ClinicalSummarySection'
import { SelectableClinicalSummarySection } from './SelectableClinicalSummarySection'

describe('clinical summary sections', () => {
  it('renders an expandable Patient resource with its original date label and no type badge', () => {
    const html = renderToStaticMarkup(
      <ClinicalSummarySection title="Active Problems" items={[{
        title: 'Infected ulcer of skin', dateLabel: 'Recorded', dateValue: '2026-07-14',
        resource: { resourceType: 'Condition', id: 'condition-1' },
        details: { groups: [{ fields: [{ label: 'Body site', values: ['Right hip'] }] }] },
      }]} />,
    )
    expect(html).toContain('<details class="clinical-entry-disclosure">')
    expect(html).toContain('aria-hidden="true">›</span>')
    expect(html).toContain('Recorded')
    expect(html).not.toContain('fhir-resource-type-badge')
  })

  it('keeps document entries navigation-only while using the shared summary markup', () => {
    const html = renderToStaticMarkup(
      <SelectableClinicalSummarySection
        title="Transitions of Care"
        items={[{ id: 'toc-1', title: 'Transfer Summary', dateLabel: 'Date', dateValue: '2026-07-14' }]}
        onSelect={() => undefined}
      />,
    )
    expect(html).toContain('class="clinical-list-main"')
    expect(html).toContain('class="clinical-select-button"')
    expect(html).not.toContain('<details')
    expect(html).not.toContain('clinical-entry-chevron')
  })
})
