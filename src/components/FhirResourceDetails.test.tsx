/** Verifies clinical disclosures keep links and caller actions inside collapsed content and preserve static fallback rows. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExpandableFhirResource } from './FhirResourceDetails'

describe('ExpandableFhirResource', () => {
  it('keeps supplied update actions inside expanded content and does not add them by default', () => {
    const props = { title: 'Medication', resource: { resourceType: 'MedicationStatement', id: 's' }, details: null, baseUrl: 'https://example.test/fhir' }
    const html = renderToStaticMarkup(<ExpandableFhirResource {...props} actions={<button type="button">Update Medication Statement</button>} />)
    expect(html.indexOf('Update Medication Statement')).toBeGreaterThan(html.indexOf('</summary>'))
    expect(html.indexOf('Update Medication Statement')).toBeLessThan(html.indexOf('</details>'))
    expect(html).not.toContain('<details open=""')
    expect(renderToStaticMarkup(<ExpandableFhirResource {...props} />)).not.toContain('Update Medication Statement')
  })
  it('renders details in a closed native disclosure', () => {
    const html = renderToStaticMarkup(
      <ExpandableFhirResource
        title="Infected ulcer of skin"
        resource={{ resourceType: 'Condition', id: 'condition-1' }}
        baseUrl="https://example.test/fhir"
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
    expect(html.indexOf('View FHIR JSON')).toBeGreaterThan(html.indexOf('</summary>'))
    expect(html.indexOf('View FHIR JSON')).toBeLessThan(html.indexOf('</details>'))
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
