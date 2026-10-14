/** Verifies typed form conversion, schedule validation, and destination-only selections before submission. */
import { describe, expect, it, vi } from 'vitest'
import { deviceFormInputs, initialDeviceForm } from './deviceFormModel'
import type { ReferenceOption } from './deviceCreateData'

describe('device form conversion', () => {
  it('defaults authored date to the local calendar and omits an optional blank date', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 9, 13, 12, 30, 45))
      expect(initialDeviceForm().authoredOn).toBe('2026-10-13')
      expect(deviceFormInputs({ ...initialDeviceForm(), authoredOn: '' }, []).request.authoredOn).toBeUndefined()
      expect(() => deviceFormInputs({ ...initialDeviceForm(), authoredOn: '2026-02-30' }, [])).toThrow('valid authored date')
      expect(deviceFormInputs({ ...initialDeviceForm(), authoredOn: '2024-02-29' }, []).request.authoredOn).toBe('2024-02-29')
    } finally {
      vi.useRealTimers()
    }
  })

  const reasonOptions: ReferenceOption[] = ['Condition', 'Observation', 'DiagnosticReport', 'DocumentReference', 'CarePlan'].map((type) => ({
    reference: `${type}/destination`, label: `${type}: Clinical reason`, display: 'Clinical reason', resource: { resourceType: type, id: 'destination' },
  }))

  it('does not infer reasons from the default device or a device-type change', () => {
    const form = initialDeviceForm()
    expect(form.reasonCodes).toEqual([])
    expect(form.reasonReferences).toEqual([])
    for (const type of ['58938008', '6012004']) {
      const input = deviceFormInputs({ ...form, type }, reasonOptions)
      expect(input.request.reasonCode).toEqual([])
      expect(input.request.reasonReference).toEqual([])
    }
  })

  it('converts multiple explicit reasons and all allowed destination reference types alongside justification', () => {
    const form = { ...initialDeviceForm(), reasonCodes: ['8510008', 'I69.320'],
      reasonReferences: reasonOptions.slice(0, 4).map((option) => option.reference), justificationNotes: ['Supports daily activities'] }
    const { request } = deviceFormInputs(form, reasonOptions)
    expect(request.reasonCode).toEqual([
      { coding: [{ system: 'http://snomed.info/sct', code: '8510008', display: 'Reduced mobility' }], text: 'Reduced mobility' },
      { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'I69.320', display: 'Aphasia following cerebral infarction' }], text: 'Aphasia following cerebral infarction' },
    ])
    expect(request.reasonReference).toEqual(reasonOptions.slice(0, 4).map((option) => ({ reference: option.reference, display: option.display })))
    expect(request.justifications?.[0].notes).toEqual(['Supports daily activities'])
  })

  it('rejects unsupported codes, stale reason references, and reference types outside FHIR R4 targets', () => {
    const form = initialDeviceForm()
    expect(() => deviceFormInputs({ ...form, reasonCodes: ['invented'] }, reasonOptions)).toThrow('supported reason code')
    expect(() => deviceFormInputs({ ...form, reasonReferences: ['Condition/source'] }, reasonOptions)).toThrow('no longer available')
    expect(() => deviceFormInputs({ ...form, reasonReferences: ['CarePlan/destination'] }, reasonOptions)).toThrow('no longer available')
  })
  it('preserves date-only precision and maps the small assistive device subset', () => {
    const form = initialDeviceForm()
    form.authoredOn = '2026-10-08'
    const input = deviceFormInputs(form, [])
    expect(input.request.authoredOn).toBe('2026-10-08')
    expect(input.device.type?.coding?.[0].code).toBe('58938008')
    expect(input.device.udiCarrier).toEqual([{ deviceIdentifier: 'DEMO-PFE-58938008', carrierHRF: 'DEMO-PFE-58938008' }])
  })
  it.each([
    ['58938008', 'Wheelchair'], ['87405001', 'Walking cane'], ['74566002', 'Crutches'],
    ['183146002', 'Walker'], ['6012004', 'Hearing aid'],
  ])('sets demo device details for %s from the selected type', (type, name) => {
    const form = initialDeviceForm()
    form.type = type
    const input = deviceFormInputs(form, [])
    expect(input.device.type?.coding?.[0].code).toBe(type)
    expect(input.device.deviceName).toEqual([{ name, type: 'user-friendly-name' }])
    expect(input.device.udiCarrier).toEqual([{ deviceIdentifier: `DEMO-PFE-${type}`, carrierHRF: `DEMO-PFE-${type}` }])
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
