import { describe, expect, it } from 'vitest'
import { formatAdiVersionNumber } from '../../igs/pacioAdi/version'

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
