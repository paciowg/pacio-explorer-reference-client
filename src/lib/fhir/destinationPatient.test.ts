/** Verifies destination Patient matching, fallback matching, and safe cross-server creation. */
import type { Bundle, Patient } from 'fhir/r4'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  searchPatients: vi.fn(),
  createPatient: vi.fn(),
}))

vi.mock('./client', () => ({
  searchPatients: mocks.searchPatients,
  createPatient: mocks.createPatient,
}))

import { ensureDestinationPatient } from './destinationPatient'

const sourcePatient: Patient = {
  resourceType: 'Patient',
  id: 'source-patient',
  meta: { versionId: '4' },
  identifier: [{ system: 'https://example.test/mrn', value: '12345' }],
  name: [{ family: 'Lovelace', given: ['Ada'] }],
}

function patientSearchBundle(patient?: Patient): Bundle {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: patient ? [{ resource: patient }] : [],
  }
}

beforeEach(() => {
  mocks.searchPatients.mockReset()
  mocks.createPatient.mockReset()
})

describe('ensureDestinationPatient', () => {
  it('reuses the loaded Patient when source and destination are the same server', async () => {
    await expect(ensureDestinationPatient({
      sourceBaseUrl: 'https://example.test/fhir/',
      destinationBaseUrl: 'https://example.test/fhir',
      patient: sourcePatient,
    })).resolves.toEqual({ patient: sourcePatient, created: false })

    expect(mocks.searchPatients).not.toHaveBeenCalled()
    expect(mocks.createPatient).not.toHaveBeenCalled()
  })

  it('uses the first Patient matched by a complete identifier', async () => {
    const destinationPatient = { ...sourcePatient, id: 'destination-patient' }
    mocks.searchPatients.mockResolvedValue(patientSearchBundle(destinationPatient))

    await expect(ensureDestinationPatient({
      sourceBaseUrl: 'https://source.test/fhir',
      destinationBaseUrl: 'https://destination.test/fhir',
      patient: sourcePatient,
    })).resolves.toEqual({ patient: destinationPatient, created: false })

    expect(mocks.searchPatients).toHaveBeenCalledWith('https://destination.test/fhir', {
      identifier: 'https://example.test/mrn|12345',
    })
    expect(mocks.createPatient).not.toHaveBeenCalled()
  })

  it('falls back to name and creates a copy without source id or meta when no match exists', async () => {
    mocks.searchPatients.mockResolvedValue(patientSearchBundle())
    mocks.createPatient.mockImplementation(async (_baseUrl, patient: Patient) => ({
      ...patient,
      id: 'created-patient',
    }))

    await expect(ensureDestinationPatient({
      sourceBaseUrl: 'https://source.test/fhir',
      destinationBaseUrl: 'https://destination.test/fhir',
      patient: sourcePatient,
    })).resolves.toMatchObject({ patient: { id: 'created-patient' }, created: true })

    expect(mocks.searchPatients.mock.calls).toEqual([
      ['https://destination.test/fhir', { identifier: 'https://example.test/mrn|12345' }],
      ['https://destination.test/fhir', { family: 'Lovelace', given: 'Ada' }],
    ])
    const postedPatient = mocks.createPatient.mock.calls[0][1] as Patient
    expect(mocks.createPatient.mock.calls[0][0]).toBe('https://destination.test/fhir')
    expect(postedPatient.id).toBeUndefined()
    expect(postedPatient.meta).toBeUndefined()
    expect(postedPatient.identifier).toEqual(sourcePatient.identifier)
  })

  it('uses the first Patient returned by the legacy name fallback', async () => {
    const destinationPatient: Patient = {
      resourceType: 'Patient', id: 'name-match', name: sourcePatient.name,
    }
    mocks.searchPatients
      .mockResolvedValueOnce(patientSearchBundle())
      .mockResolvedValueOnce(patientSearchBundle(destinationPatient))

    await expect(ensureDestinationPatient({
      sourceBaseUrl: 'https://source.test/fhir',
      destinationBaseUrl: 'https://destination.test/fhir',
      patient: sourcePatient,
    })).resolves.toEqual({ patient: destinationPatient, created: false })
    expect(mocks.createPatient).not.toHaveBeenCalled()
  })

  it('propagates a failed search instead of creating a potentially duplicate Patient', async () => {
    mocks.searchPatients.mockRejectedValue(new Error('Patient search denied.'))

    await expect(ensureDestinationPatient({
      sourceBaseUrl: 'https://source.test/fhir',
      destinationBaseUrl: 'https://destination.test/fhir',
      patient: sourcePatient,
    })).rejects.toThrow('Patient search denied.')
    expect(mocks.createPatient).not.toHaveBeenCalled()
  })
})
