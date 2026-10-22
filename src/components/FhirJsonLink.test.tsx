/** Verifies raw-resource links preserve their source server and open outside clinical navigation. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FhirJsonLink } from './FhirJsonLink'
import { ClinicalSummarySection } from './ClinicalSummarySection'
import { SelectableClinicalSummarySection } from './SelectableClinicalSummarySection'
import { parseHashRoute } from '../lib/routing/routes'

describe('FHIR JSON links', () => {
  const resource = { resourceType: 'Condition' as const, id: 'c' }
  const baseUrl = 'https://example.test/fhir'
  it('round trips the source server and resource through the viewer route', () => {
    const html = renderToStaticMarkup(<FhirJsonLink resource={resource} baseUrl={baseUrl} />)
    const href = html.match(/href="([^"]+)"/)![1]
    expect(parseHashRoute(href)).toEqual({ name: 'fhirViewer', baseUrl, resourceType: 'Condition', resourceId: 'c' })
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('opens in a new tab')
  })
  it('omits unreadable resources without IDs or source servers', () => {
    expect(renderToStaticMarkup(<FhirJsonLink resource={{ resourceType: 'Condition' }} baseUrl={baseUrl} />)).toBe('')
    expect(renderToStaticMarkup(<FhirJsonLink resource={resource} />)).toBe('')
  })
  it('keeps JSON-only clinical entries expandable with the link hidden inside', () => {
    const html = renderToStaticMarkup(<ClinicalSummarySection title="Problems" baseUrl={baseUrl} items={[{ title: 'Problem', resource, details: null }]} />)
    expect(html).toContain('View FHIR JSON')
    expect(html).toContain('<details class="clinical-entry-disclosure">')
    expect(html).not.toContain('<details open')
    expect(html.indexOf('View FHIR JSON')).toBeGreaterThan(html.indexOf('</summary>'))
    expect(html.indexOf('View FHIR JSON')).toBeLessThan(html.indexOf('</details>'))
  })
  it('keeps document summary rows free of JSON links', () => {
    const html = renderToStaticMarkup(<SelectableClinicalSummarySection title="Documents" items={[{ id: 'd', title: 'Document', resource: { resourceType: 'DocumentReference', id: 'd' } }]} onSelect={() => {}} />)
    expect(html).toContain('clinical-select-button')
    expect(html).not.toContain('View FHIR JSON')
  })
})
