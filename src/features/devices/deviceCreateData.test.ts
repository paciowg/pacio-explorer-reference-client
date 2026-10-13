/** Verifies read-only destination choice loading and pending-Patient selection without source-reference leakage. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findDestinationPatient: vi.fn(), searchResources: vi.fn(), fetchPatientEverything: vi.fn() }))
vi.mock('../../lib/fhir/destinationPatient', () => ({ findDestinationPatient: mocks.findDestinationPatient }))
vi.mock('../../lib/fhir/deviceTransport', () => ({ searchResources: mocks.searchResources }))
vi.mock('../../lib/fhir/client', () => ({ fetchPatientEverything: mocks.fetchPatientEverything }))
import { loadDeviceCreateData, optionReference } from './deviceCreateData'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.searchResources.mockResolvedValue({ resourceType: 'Bundle', type: 'searchset', entry: [] })
  mocks.fetchPatientEverything.mockResolvedValue({ resourceType: 'Bundle', type: 'collection', entry: [] })
})
describe('destination device choices', () => {
  it('prefers all matching roles while retaining unpaired practitioners and unresolved or external roles', async () => {
    mocks.findDestinationPatient.mockResolvedValue(null)
    mocks.searchResources.mockImplementation(async (_base, type) => ({ resourceType: 'Bundle', type: 'searchset', entry: (type === 'Practitioner' ? [
      { resourceType: 'Practitioner', id: 'covered', name: [{ text: 'Alex Smith' }] },
      { resourceType: 'Practitioner', id: 'standalone', name: [{ text: 'Jamie Jones' }] },
      { resourceType: 'Practitioner', id: 'external', name: [{ text: 'Taylor Lee' }] },
    ] : type === 'PractitionerRole' ? [
      { resourceType: 'PractitionerRole', id: 'relative', practitioner: { reference: 'Practitioner/covered' }, code: [{ text: 'Physician' }] },
      { resourceType: 'PractitionerRole', id: 'absolute', practitioner: { reference: 'https://destination.test/fhir/Practitioner/covered' }, code: [{ text: 'Therapist' }] },
      { resourceType: 'PractitionerRole', id: 'versioned', practitioner: { reference: 'https://destination.test/fhir/Practitioner/covered/_history/2' }, code: [{ text: 'Nurse' }] },
      { resourceType: 'PractitionerRole', id: 'unresolved', practitioner: { reference: 'Practitioner/missing' }, code: [{ text: 'Specialist' }] },
      { resourceType: 'PractitionerRole', id: 'outside', practitioner: { reference: 'https://other.test/fhir/Practitioner/external' }, code: [{ text: 'External clinician' }] },
    ] : []).map((resource) => ({ resource })) }))
    const { options } = await loadDeviceCreateData('https://source.test/fhir', 'https://destination.test/fhir', { resourceType: 'Patient', id: 'source' })
    expect(options.map((option) => option.reference)).not.toContain('Practitioner/covered')
    expect(options.map((option) => option.reference)).toEqual(expect.arrayContaining([
      'Practitioner/standalone', 'Practitioner/external', 'PractitionerRole/relative', 'PractitionerRole/absolute',
      'PractitionerRole/versioned', 'PractitionerRole/unresolved', 'PractitionerRole/outside',
    ]))
    expect(options.find((option) => option.reference === 'PractitionerRole/absolute')?.label).toBe('PractitionerRole: Alex Smith — Therapist')
    expect(options.find((option) => option.reference === 'PractitionerRole/versioned')?.label).toBe('PractitionerRole: Alex Smith — Nurse')
    expect(optionReference(options, 'PractitionerRole/relative')).toEqual({ reference: 'PractitionerRole/relative', display: 'Alex Smith — Physician' })
    expect(optionReference(options.map((option) => ({ ...option, label: 'Changed UI label' })), 'PractitionerRole/relative')?.display).toBe('Alex Smith — Physician')
    expect(() => optionReference(options, 'Practitioner/covered')).toThrow('no longer available')
  })
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
