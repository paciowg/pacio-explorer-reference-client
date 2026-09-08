/** Verifies expandable FHIR entries render accessible native disclosure markup only when details exist. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExpandableFhirResource } from './FhirResourceDetails'

describe('ExpandableFhirResource', () => {
  it('renders details in a closed native disclosure', () => {
    const html = renderToStaticMarkup(
      <ExpandableFhirResource
        title="Infected ulcer of skin"
        resource={{ resourceType: 'Condition', id: 'condition-1' }}
        dateValue="2026-07-14"
        details={{ groups: [{ fields: [{ label: 'Body site', values: ['Right hip'] }] }] }}
      />,
    )
    expect(html).toContain('<details class="clinical-entry-disclosure">')
    expect(html).not.toContain('<details open=""')
    expect(html).toContain('<summary>')
    expect(html).toContain('aria-hidden="true">›</span>')
    expect(html).not.toContain('>Details</span>')
    expect(html).toContain('Body site')
    expect(html).toContain('Right hip')
  })

  it('renders a non-interactive row when no useful details exist', () => {
    const html = renderToStaticMarkup(
      <ExpandableFhirResource
        title="Basic/basic-1"
        resource={{ resourceType: 'Basic', id: 'basic-1' }}
        details={null}
      />,
    )
    expect(html).not.toContain('<details')
    expect(html).toContain('Basic/basic-1')
  })
})
