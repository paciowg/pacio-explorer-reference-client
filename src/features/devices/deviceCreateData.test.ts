/** Verifies read-only destination choice loading and pending-Patient selection without source-reference leakage. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findDestinationPatient: vi.fn(), searchResources: vi.fn(), fetchPatientEverything: vi.fn() }))
vi.mock('../../lib/fhir/destinationPatient', () => ({ findDestinationPatient: mocks.findDestinationPatient }))
vi.mock('../../lib/fhir/deviceTransport', () => ({ searchResources: mocks.searchResources }))
vi.mock('../../lib/fhir/client', () => ({ fetchPatientEverything: mocks.fetchPatientEverything }))
import { loadDeviceCreateData } from './deviceCreateData'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.searchResources.mockResolvedValue({ resourceType: 'Bundle', type: 'searchset', entry: [] })
  mocks.fetchPatientEverything.mockResolvedValue({ resourceType: 'Bundle', type: 'collection', entry: [] })
})
describe('destination device choices', () => {
  it('keeps a pending patient choice without doing any patient-specific searches when no match exists', async () => {
    mocks.findDestinationPatient.mockResolvedValue(null)
    const data = await loadDeviceCreateData('https://source.test', 'https://destination.test', { resourceType: 'Patient', id: 'source', name: [{ text: 'Ada' }] })
    expect(data.patient).toBeNull()
    expect(data.options[0].reference).toBe('Patient/pending')
    expect(mocks.fetchPatientEverything).not.toHaveBeenCalled()
    expect(mocks.searchResources.mock.calls.every((call) => call[0] === 'https://destination.test')).toBe(true)
  })
  it('uses the matched destination Patient and reports clinical search failures', async () => {
    mocks.findDestinationPatient.mockResolvedValue({ resourceType: 'Patient', id: 'destination' })
    mocks.fetchPatientEverything.mockRejectedValue(new Error('unsupported'))
    const data = await loadDeviceCreateData('https://source.test', 'https://destination.test', { resourceType: 'Patient', id: 'source' })
    expect(data.options.some((option) => option.reference === 'Patient/destination')).toBe(true)
    expect(mocks.fetchPatientEverything).toHaveBeenCalledWith('https://destination.test', 'destination')
    expect(data.warning).toContain('$everything failed')
  })
  it('propagates failed Patient matching instead of assuming absence', async () => {
    mocks.findDestinationPatient.mockRejectedValue(new Error('Search denied'))
    await expect(loadDeviceCreateData('source', 'destination', { resourceType: 'Patient', id: 'p' })).rejects.toThrow('Search denied')
    expect(mocks.searchResources).not.toHaveBeenCalled()
  })
})
