/** Verifies reusable display formatting for common FHIR datatypes. */
import { describe, expect, it } from 'vitest'
import { formatAdiVersionNumber } from '../../igs/pacioAdi/version'
import { getCodeableConceptText, getNarrativeText } from './formatters'

describe('formatAdiVersionNumber', () => {
  it('formats UTC timestamps at date boundaries', () => {
    expect(formatAdiVersionNumber('2024-12-31T23:59:59.999-01:00')).toBe('20250101005959')
    expect(formatAdiVersionNumber(new Date('2024-02-29T00:00:00.000Z'))).toBe('20240229000000')
  })

  it('rejects invalid timestamps', () => {
    expect(() => formatAdiVersionNumber('not-a-date')).toThrow(
      'Unable to generate ADI version number from an invalid timestamp.',
    )
  })
})

describe('FHIR text formatters', () => {
  it('prefers text, then the first display anywhere in coding, then the first code', () => {
    expect(getCodeableConceptText({ coding: [
      { system: 'http://loinc.org', code: '59408-5' },
      { system: 'http://loinc.org', code: '2708-6', display: 'Oxygen saturation in Arterial blood' },
    ] })).toBe('Oxygen saturation in Arterial blood')
    expect(getCodeableConceptText({ coding: [{ code: 'first-code' }, { code: 'second-code' }] })).toBe('first-code')
  })

  it('normalizes XHTML narrative without retaining markup or executable content', () => {
    expect(getNarrativeText({
      status: 'generated',
      div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Pain &amp; interference.</p><script>ignored()</script></div>',
    })).toBe('Pain & interference.')
  })
})
