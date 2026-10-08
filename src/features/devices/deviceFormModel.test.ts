/** Verifies typed form conversion, schedule validation, and destination-only selections before submission. */
import { describe, expect, it } from 'vitest'
import { deviceFormInputs, initialDeviceForm } from './deviceFormModel'

describe('device form conversion', () => {
  it('uses UTC timestamps, leaves UDI absent, and maps the small assistive device subset', () => {
    const form = initialDeviceForm()
    form.authoredOn = '2026-10-08T12:30'
    const input = deviceFormInputs(form, [])
    expect(input.request.authoredOn).toBe('2026-10-08T12:30:00.000Z')
    expect(input.device.type?.coding?.[0].code).toBe('58938008')
    expect(input.device.udiCarrier).toBeUndefined()
  })
  it('rejects invalid numeric schedules and reversed periods or ranges', () => {
    const form = { ...initialDeviceForm(), occurrence: 'timing' as const, frequency: '1.5' }
    expect(() => deviceFormInputs(form, [])).toThrow('whole number')
    expect(() => deviceFormInputs({ ...form, frequency: '1', period: '0' }, [])).toThrow('positive number')
    expect(() => deviceFormInputs({ ...form, occurrence: 'period', start: '2026-10-09', end: '2026-10-08' }, [])).toThrow('end must not precede')
  })
  it('rejects stale references rather than copying source IDs into a destination request', () => {
    expect(() => deviceFormInputs({ ...initialDeviceForm(), owner: 'Organization/source' }, [])).toThrow('no longer available')
  })
  it('converts coded locations and boolean false without losing their choice types', () => {
    const form = initialDeviceForm()
    form.locations = [{ kind: 'coded', value: '42665001' }, { kind: 'text', value: 'At home' }]
    form.parameters = [{ code: '103355008', kind: 'boolean', value: 'false', unit: '', high: '' }]
    const input = deviceFormInputs(form, [])
    expect(input.request.locations?.[0]).toMatchObject({ coding: [{ code: '42665001' }] })
    expect(input.request.parameter?.[0].valueBoolean).toBe(false)
  })
})
