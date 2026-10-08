/** Verifies sequential patient/device/request creation, destination references, and partial-failure retry behavior. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { snomedConcept } from '../../igs/pacioPfe/deviceRequest'

const mocks = vi.hoisted(() => ({ ensureDestinationPatient: vi.fn(), createDevice: vi.fn(), createDeviceRequest: vi.fn() }))
vi.mock('../../lib/fhir/destinationPatient', () => ({ ensureDestinationPatient: mocks.ensureDestinationPatient }))
vi.mock('../../lib/fhir/deviceTransport', () => ({ createDevice: mocks.createDevice, createDeviceRequest: mocks.createDeviceRequest }))
import { createPatientDeviceRequest, type DeviceCreationProgress, type CreateDeviceRequestInput } from './createDeviceRequest'

const input: CreateDeviceRequestInput = { sourceBaseUrl: 'https://source.test/fhir', destinationBaseUrl: 'https://destination.test/fhir',
  patient: { resourceType: 'Patient', id: 'source' }, device: { type: snomedConcept('58938008', 'Wheelchair'), owner: { reference: 'Organization/destination-owner' } },
  request: { status: 'draft', intent: 'order', requester: { reference: 'PractitionerRole/destination-requester' }, users: [{ user: { reference: 'Patient/pending' } }] } }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.ensureDestinationPatient.mockResolvedValue({ patient: { resourceType: 'Patient', id: 'destination-patient' }, created: true })
  mocks.createDevice.mockImplementation(async (_base, device) => ({ ...device, id: 'created-device' }))
  mocks.createDeviceRequest.mockImplementation(async (_base, request) => ({ ...request, id: 'created-request' }))
})

describe('device request creation', () => {
  it('posts linked resources in order with destination Patient and resource references', async () => {
    const result = await createPatientDeviceRequest(input, {})
    expect(result.subject.reference).toBe('Patient/destination-patient')
    expect(result.codeReference?.reference).toBe('Device/created-device')
    expect(result.requester).toEqual(input.request.requester)
    expect(result.extension?.[0].extension?.[0].valueReference?.reference).toBe('Patient/destination-patient')
    expect(mocks.createDevice.mock.calls[0][1].patient.reference).toBe('Patient/destination-patient')
    expect(mocks.createDevice.mock.invocationCallOrder[0]).toBeLessThan(mocks.createDeviceRequest.mock.invocationCallOrder[0])
  })
  it('validates before any writes and propagates Patient matching failures', async () => {
    await expect(createPatientDeviceRequest({ ...input, device: { ...input.device, udiCarrier: [{ carrierHRF: 'missing DI' }] } }, {})).rejects.toThrow('device identifier')
    expect(mocks.ensureDestinationPatient).not.toHaveBeenCalled()
    mocks.ensureDestinationPatient.mockRejectedValue(new Error('Search denied'))
    await expect(createPatientDeviceRequest(input, {})).rejects.toThrow('Search denied')
    expect(mocks.createDevice).not.toHaveBeenCalled()
  })
  it('reuses the already-created Device after a definite request failure', async () => {
    const progress: DeviceCreationProgress = {}
    mocks.createDeviceRequest.mockRejectedValueOnce(new Error('Validation failed'))
    await expect(createPatientDeviceRequest(input, progress)).rejects.toThrow('Device/created-device remains')
    await createPatientDeviceRequest(input, progress)
    expect(mocks.createDevice).toHaveBeenCalledOnce()
    expect(mocks.ensureDestinationPatient).toHaveBeenCalledOnce()
    expect(mocks.createDeviceRequest).toHaveBeenCalledTimes(2)
  })
  it('blocks automatic retry when a write outcome is uncertain', async () => {
    const progress: DeviceCreationProgress = {}
    mocks.createDeviceRequest.mockRejectedValueOnce(new TypeError('Network disconnected'))
    await expect(createPatientDeviceRequest(input, progress)).rejects.toThrow('Network disconnected')
    await expect(createPatientDeviceRequest(input, progress)).rejects.toThrow('uncertain outcome')
    expect(mocks.createDeviceRequest).toHaveBeenCalledOnce()
  })
})
