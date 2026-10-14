/** Verifies patient scoping, shared-device presentation, and reference resolution across generic and PFE records. */
import type { Bundle, Device, DeviceRequest, DeviceUseStatement } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { buildPfeDeviceRequest } from '../../igs/pacioPfe/deviceRequest'
import { deviceEntryDetails, getPatientDevices } from './deviceModel'

const base = 'https://example.test/fhir'
const device: Device = { resourceType: 'Device', id: 'wheelchair', patient: { reference: 'Patient/p' }, deviceName: [{ name: 'Wheelchair', type: 'user-friendly-name' }], owner: { display: 'Demo clinic' } }
const request: DeviceRequest = { resourceType: 'DeviceRequest', id: 'request', status: 'draft', intent: 'order', subject: { reference: 'Patient/p' }, codeReference: { reference: 'Device/wheelchair' } }
const use: DeviceUseStatement = { resourceType: 'DeviceUseStatement', id: 'use', status: 'active', subject: { reference: 'Patient/p' }, device: { reference: 'Device/wheelchair' } }
const bundle = (...resources: Array<Device | DeviceRequest | DeviceUseStatement>): Bundle => ({ resourceType: 'Bundle', type: 'collection', entry: resources.map((resource) => ({ resource })) })

describe('patient devices', () => {
  it('orders dated requests and usage together, keeping ties stable and undated Devices last', () => {
    const b = bundle(
      { ...request, id: 'old', authoredOn: '2026-01-01' },
      { ...request, id: 'missing' },
      { ...use, id: 'timed', timingDateTime: '2026-10-14T09:00:00-04:00' },
      { ...request, id: 'tie', authoredOn: '2026-10-14T13:00:00Z' },
      { ...request, id: 'invalid', authoredOn: 'not-a-date' },
      { ...use, id: 'period', timingPeriod: { start: '2026-02-01' } },
      { ...use, id: 'recorded', recordedOn: '2026-03-01', timingDateTime: '2026-12-01' },
      { ...device, id: 'standalone', manufactureDate: '2026-12-31' },
      device,
    )
    expect(getPatientDevices(b, 'p', base).map((entry) => entry.resource.id)).toEqual([
      'timed', 'tie', 'recorded', 'period', 'old', 'missing', 'invalid', 'standalone',
    ])
    expect(b.entry?.[0].resource?.id).toBe('old')
  })

  it('keeps request and usage events but suppresses their shared standalone Device', () => {
    const entries = getPatientDevices(bundle(device, request, use, { ...device, id: 'standalone' }, { ...device, id: 'other', patient: { reference: 'Patient/other' } }), 'p', base)
    expect(entries.map((entry) => entry.resource.resourceType)).toEqual(['DeviceRequest', 'DeviceUseStatement', 'Device'])
    expect(entries[0].title).toBe('Wheelchair')
    expect(deviceEntryDetails(entries[0]).groups.find((group) => group.title === 'Associated Device')?.fields).toContainEqual({ label: 'Owner', values: ['Demo clinic'] })
  })
  it('resolves absolute historical references and contained Devices', () => {
    const entries = getPatientDevices(bundle(device, { ...request, codeReference: { reference: `${base}/Device/wheelchair/_history/1` } }, { ...use, contained: [{ ...device, id: 'contained' }], device: { reference: '#contained' } }), 'p', base)
    expect(entries).toHaveLength(2)
    expect(entries[1].device?.id).toBe('contained')
  })
  it('resolves fullUrl references and does not merge two Devices by name', () => {
    const b = bundle(device, { ...device, id: 'another' }, { ...request, codeReference: { reference: 'urn:uuid:device' } })
    b.entry![0].fullUrl = 'urn:uuid:device'
    expect(getPatientDevices(b, 'p', base).map((entry) => entry.key)).toEqual(['DeviceRequest/request', 'Device/another'])
  })
  it('preserves coded requests, missing references, and PFE justification', () => {
    const pfe = buildPfeDeviceRequest({ subject: { reference: 'Patient/p' }, device: { reference: 'Device/missing' }, status: 'draft', intent: 'order', justifications: [{ notes: ['Clinical need'] }] })
    const entries = getPatientDevices(bundle({ ...request, codeReference: undefined, codeCodeableConcept: { text: 'Walker' } }, { ...pfe, id: 'pfe' }), 'p', base)
    expect(entries[0].title).toBe('Walker')
    expect(entries[1].device).toBeUndefined()
    expect(deviceEntryDetails(entries[1]).groups.find((group) => group.title === 'PFE request details')?.fields[0].values).toEqual(['Clinical need'])
    expect(getPatientDevices(null, 'p', base)).toEqual([])
  })
})
