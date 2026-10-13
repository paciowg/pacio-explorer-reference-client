/** Exercises PFE resource conformance and round-trip interpretation independently of browser and transport code. */
import { describe, expect, it } from 'vitest'
import { ASSISTIVE_DEVICES, buildPfeDevice, buildPfeDeviceRequest, interpretPfeDeviceRequest, PFE_ADDITIONAL_REQUESTER, PFE_DEVICE_PROFILE, PFE_DEVICE_REQUEST_PROFILE, snomedConcept } from './deviceRequest'

const patient = { reference: 'Patient/patient-1' }
const device = { reference: 'Device/device-1' }
const type = snomedConcept(ASSISTIVE_DEVICES[0].code, ASSISTIVE_DEVICES[0].display)
const request = { subject: patient, device, status: 'draft' as const, intent: 'order' as const }

describe('PFE device reference implementation', () => {
  it('creates a profiled linked pair without invented UDI or performer data', () => {
    const builtDevice = buildPfeDevice({ patient, type, deviceName: [{ name: 'Wheelchair', type: 'user-friendly-name' }], owner: { reference: 'Organization/owner' } })
    const builtRequest = buildPfeDeviceRequest({ ...request, performer: patient, performerType: type } as typeof request)
    expect(builtDevice.meta?.profile).toEqual([PFE_DEVICE_PROFILE])
    expect(builtDevice.udiCarrier).toBeUndefined()
    expect(builtRequest.meta?.profile).toEqual([PFE_DEVICE_REQUEST_PROFILE])
    expect(builtRequest.codeReference).toEqual(device)
    expect(builtRequest.codeCodeableConcept).toBeUndefined()
    expect(builtRequest.performer).toBeUndefined()
    expect(builtRequest.performerType).toBeUndefined()
  })

  it('requires the inherited UDI identifier only when a UDI carrier is present', () => {
    expect(() => buildPfeDevice({ patient, type, udiCarrier: [{ carrierHRF: '123' }] })).toThrow('device identifier')
    expect(buildPfeDevice({ patient, type, udiCarrier: [{ deviceIdentifier: '123', carrierHRF: '(01)123' }] }).udiCarrier).toHaveLength(1)
    expect(() => buildPfeDevice({ patient, type, udiCarrier: [{ deviceIdentifier: '1' }, { deviceIdentifier: '2' }] })).toThrow('at most one')
    expect(() => buildPfeDevice({ patient, type, owner: { reference: 'Patient/patient-1' } })).toThrow('Organization')
  })
  it('omits empty arrays from FHIR JSON while retaining populated values', () => {
    const built = buildPfeDeviceRequest({ ...request, note: [], insurance: [], parameter: [], priorRequest: [], reasonCode: [], reasonReference: [] })
    expect(JSON.stringify(built)).not.toContain('[]')
    expect(built.reasonCode).toBeUndefined()
    expect(built.reasonReference).toBeUndefined()
    expect(buildPfeDevice({ patient, type, deviceName: [] }).deviceName).toBeUndefined()
  })

  it.each(['code', 'reference', 'both'])('preserves optional reasons (%s) alongside clinical justification', (kind) => {
    const reasonCode = kind !== 'reference' ? [{ coding: [{ system: 'http://snomed.info/sct', code: '8510008', display: 'Reduced mobility' }] }] : undefined
    const reasonReference = kind !== 'code' ? [{ reference: 'Condition/mobility' }, { reference: 'Observation/assessment' }] : undefined
    const built = buildPfeDeviceRequest({ ...request, reasonCode, reasonReference, justifications: [{ notes: ['Needs mobility support'] }] })
    expect(built.reasonCode).toEqual(reasonCode)
    expect(built.reasonReference).toEqual(reasonReference)
    expect(interpretPfeDeviceRequest(built).justifications[0].notes).toEqual(['Needs mobility support'])
  })

  it('enforces occurrence and parameter choice exclusivity, including boolean false', () => {
    expect(() => buildPfeDeviceRequest({ ...request, occurrenceDateTime: '2026-10-08', occurrencePeriod: { start: '2026-10-08' } })).toThrow('occurrence')
    expect(() => buildPfeDeviceRequest({ ...request, parameter: [{ code: type, valueBoolean: false, valueQuantity: { value: 1 } }] })).toThrow('parameter value')
    expect(buildPfeDeviceRequest({ ...request, parameter: [{ code: type, valueBoolean: false }] }).parameter?.[0].valueBoolean).toBe(false)
  })

  it('round-trips all PFE extension groups and reads additional requesters and Annotation notes', () => {
    const built = buildPfeDeviceRequest({ ...request, locations: ['At home', snomedConcept('42665001', 'Nursing home')],
      users: [{ user: patient, relationships: [{ text: 'Patient' }] }],
      justifications: [{ notes: ['Needs mobility support'], assessments: [{ reference: 'Observation/assessment' }], uses: [{ reference: 'DeviceUseStatement/use' }], goals: [{ reference: 'Goal/goal' }] }],
      requester: { extension: [{ url: PFE_ADDITIONAL_REQUESTER, valueReference: { reference: 'RelatedPerson/requester' } }] } })
    built.extension?.find((extension) => extension.url.endsWith('clinical-justification'))?.extension?.push({ url: 'note', valueAnnotation: { text: 'Patient-reported need' } })
    const interpreted = interpretPfeDeviceRequest(built)
    expect(interpreted.locations).toHaveLength(2)
    expect(interpreted.users[0].user).toEqual(patient)
    expect(interpreted.justifications[0]).toEqual({ notes: ['Needs mobility support', 'Patient-reported need'], assessments: [{ reference: 'Observation/assessment' }], uses: [{ reference: 'DeviceUseStatement/use' }], goals: [{ reference: 'Goal/goal' }] })
    expect(interpreted.additionalRequester?.reference).toBe('RelatedPerson/requester')
  })

  it('preserves all supported request fields without requiring optional Must Support values', () => {
    const fields = { ...request, priority: 'routine' as const, groupIdentifier: { value: 'group' }, encounter: { reference: 'Encounter/one' },
      authoredOn: '2026-10-08T12:00:00Z', occurrenceTiming: { repeat: { frequency: 1, period: 1, periodUnit: 'd' as const } },
      requester: { reference: 'PractitionerRole/one' }, priorRequest: [{ reference: 'DeviceRequest/prior' }], insurance: [{ reference: 'Coverage/one' }], note: [{ text: 'Demo' }] }
    const { device: deviceReference, ...expected } = fields
    expect(buildPfeDeviceRequest(fields)).toMatchObject({ ...expected, codeReference: deviceReference })
  })
})
