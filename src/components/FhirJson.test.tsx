/** Verifies JSON highlighting preserves FHIR values and escapes narrative markup as text. */
import { renderToStaticMarkup } from 'react-dom/server'
import type { Patient } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { FhirJson } from './FhirJson'

describe('FhirJson', () => {
  it('colors keys, strings, numbers, and literals without losing JSON formatting', () => {
    const resource: Patient = { resourceType: 'Patient', id: 'p', active: true, multipleBirthInteger: 2, birthDate: '2026-10-22', name: [{ text: 'A "quoted" name' }] }
    const html = renderToStaticMarkup(<FhirJson resource={resource} />)
    expect(html).toContain('class="json-key"')
    expect(html).toContain('class="json-string"')
    expect(html).toContain('class="json-number">2</span>')
    expect(html).toContain('class="json-literal">true</span>')
    expect(html).toContain('2026-10-22')
    expect(html).toContain('tabindex="0"')
    const text = html.replace(/<[^>]*>/g, '').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
    expect(JSON.parse(text)).toEqual({ resourceType: 'Patient', id: 'p', active: true, multipleBirthInteger: 2, birthDate: '2026-10-22', name: [{ text: 'A "quoted" name' }] })
    expect(text).toContain('\n  "resourceType": "Patient"')
  })

  it('renders FHIR narrative HTML as escaped text', () => {
    const resource: Patient = { resourceType: 'Patient', text: { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></div>' } }
    const html = renderToStaticMarkup(<FhirJson resource={resource} />)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})
