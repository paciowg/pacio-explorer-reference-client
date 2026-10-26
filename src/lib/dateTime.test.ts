/** Verifies calendar precision and local timestamp displays under externally selected timezone environments. */
import { describe, expect, it, vi } from 'vitest'
import { calendarDateValue, compareClinicalDatesDesc, formatLocalTimestamp, localDateInputValue } from './dateTime'
import { initialDeviceForm } from '../features/devices/deviceFormModel'
import { initialNutritionForm } from '../features/nutritionOrders/nutritionFormModel'

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
const cases: Record<string, { date: string; day: number; hour: number }> = {
  UTC: { date: '2026-10-13', day: 13, hour: 0 },
  'America/New_York': { date: '2026-10-12', day: 12, hour: 20 },
  'Asia/Calcutta': { date: '2026-10-13', day: 13, hour: 6 },
  'Asia/Kolkata': { date: '2026-10-13', day: 13, hour: 6 },
}

describe('clinical date ordering', () => {
  it.each([
    ['2026-10-01', '2026-10-02', '2026-12-01T00:00:00Z', undefined, 1],
    ['2026-10-01', '2026-10-01', '2026-10-02T11:00:00Z', '2026-10-02T10:00:00Z', -1],
    ['2026-10-01', '2026-10-01', '2026-10-02T11:00:00Z', undefined, -1],
    ['2026-10-01', '2026-10-01', 'invalid', '2026-10-02T10:00:00Z', 1],
    ['2026-10-01', '2026-10-01', undefined, 'invalid', 0],
    ['2026-10-01T09:00:00-04:00', '2026-10-01T13:00:00Z', '2026-10-02T10:00:00Z', '2026-10-02T10:00:00Z', 0],
    [undefined, 'invalid', '2026-10-02T11:00:00Z', '2026-10-02T10:00:00Z', 0],
    [undefined, '2026-10-01', '2026-12-01T00:00:00Z', undefined, 1],
  ] as const)('compares %s and %s with update timestamps %s and %s', (a, b, aUpdated, bUpdated, expected) => {
    expect(Math.sign(compareClinicalDatesDesc(a, b, aUpdated, bUpdated))).toBe(expected)
    expect(Math.sign(compareClinicalDatesDesc(b, a, bUpdated, aUpdated)) || 0).toBe(-expected || 0)
  })
})

describe('local date and time handling', () => {
  it.skipIf(!cases[zone])('uses the local calendar date for defaults at UTC date boundaries', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-10-13T00:30:00Z'))
      expect(localDateInputValue()).toBe(cases[zone].date)
      expect(initialDeviceForm().authoredOn).toBe(cases[zone].date)
      expect(initialNutritionForm().dateTime).toBe(cases[zone].date)
    } finally {
      vi.useRealTimers()
    }
  })

  it.skipIf(!cases[zone])('displays equivalent instants in the local timezone', () => {
    const display = formatLocalTimestamp('2026-10-13T00:30:00Z')
    const parts = new Intl.DateTimeFormat(undefined, { day: 'numeric', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date('2026-10-13T00:30:00Z'))
    expect(Number(parts.find((part) => part.type === 'day')?.value)).toBe(cases[zone].day)
    expect(Number(parts.find((part) => part.type === 'hour')?.value)).toBe(cases[zone].hour)
    expect(display).toBe(new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
    }).format(new Date('2026-10-13T00:30:00Z')))
    expect(formatLocalTimestamp('2026-10-12T20:30:00-04:00')).toBe(display)
  })

  it('preserves calendar dates, partial dates, standalone times, and unsupported values', () => {
    for (const value of ['2026', '2026-10', '2026-10-13', '12:30:00', 'bad', '2026-02-30T12:30:00Z', '2026-10-13T12:30:00']) {
      expect(formatLocalTimestamp(value)).toBe(value)
    }
    expect(calendarDateValue('2024-02-29')).toBe('2024-02-29')
    for (const value of ['', '2025-02-29', '2026-04-31', '2026-13-01', '2026-10', '0000-01-01']) {
      expect(() => calendarDateValue(value)).toThrow('valid')
    }
  })

  it.skipIf(zone !== 'America/New_York')('uses seasonal display offsets and preserves local year boundaries', () => {
    expect(formatLocalTimestamp('2026-01-13T17:30:00Z')).toContain('EST')
    expect(formatLocalTimestamp('2026-07-13T16:30:00Z')).toContain('EDT')
    expect(localDateInputValue(new Date('2027-01-01T00:30:00Z'))).toBe('2026-12-31')
  })
})
