/** Verifies nutrition publication ordering, existing-allergy reuse, separate writes, and retry behavior after partial failures. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildNoKnownFoodAllergy } from '../../lib/fhir/allergies'

const mocks = vi.hoisted(() => ({ ensureDestinationPatient: vi.fn(), searchPatientAllergies: vi.fn(), createAllergyIntolerance: vi.fn(), createNutritionOrder: vi.fn() }))
vi.mock('../../lib/fhir/destinationPatient', () => ({ ensureDestinationPatient: mocks.ensureDestinationPatient }))
vi.mock('./nutritionCreateData', () => ({ searchPatientAllergies: mocks.searchPatientAllergies }))
vi.mock('../../lib/fhir/nutritionTransport', () => ({ createAllergyIntolerance: mocks.createAllergyIntolerance, createNutritionOrder: mocks.createNutritionOrder }))
import { createPatientNutritionOrder, type CreateNutritionOrderInput, type NutritionCreationProgress } from './createNutritionOrder'

const input: CreateNutritionOrderInput = { sourceBaseUrl: 'https://source.test/fhir', destinationBaseUrl: 'https://destination.test/fhir', patient: { resourceType: 'Patient', id: 'source' }, recordedAt: '2026-10-08T12:00:00Z',
  allergies: { mode: 'none-known' }, order: { status: 'draft', intent: 'order', dateTime: '2026-10-08T12:00:00Z', oralDiet: { instruction: 'Eat slowly' }, orderer: { reference: 'PractitionerRole/destination' } } }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.ensureDestinationPatient.mockResolvedValue({ patient: { resourceType: 'Patient', id: 'destination' }, created: false })
  mocks.searchPatientAllergies.mockResolvedValue({ resourceType: 'Bundle', type: 'searchset', entry: [] })
  mocks.createAllergyIntolerance.mockImplementation(async (_base, allergy) => ({ ...allergy, id: 'created-allergy' }))
  mocks.createNutritionOrder.mockImplementation(async (_base, order) => ({ ...order, id: 'created-order' }))
})
describe('nutrition order publication', () => {
  it('creates a standalone negative allergy before the order and uses destination patient references', async () => {
    const result = await createPatientNutritionOrder(input, {})
    expect(result.patient.reference).toBe('Patient/destination')
    expect(result.allergyIntolerance?.[0].reference).toBe('AllergyIntolerance/created-allergy')
    expect(result.orderer?.reference).toBe('PractitionerRole/destination')
    expect(result.contained).toBeUndefined()
    expect(mocks.createAllergyIntolerance.mock.calls[0][1].patient.reference).toBe('Patient/destination')
    expect(mocks.createAllergyIntolerance.mock.invocationCallOrder[0]).toBeLessThan(mocks.createNutritionOrder.mock.invocationCallOrder[0])
  })
  it('reuses an eligible negative record without creating another', async () => {
    mocks.searchPatientAllergies.mockResolvedValue({ entry: [{ resource: { ...buildNoKnownFoodAllergy({ reference: 'Patient/destination' }, input.recordedAt), id: 'existing' } }] })
    const result = await createPatientNutritionOrder(input, {})
    expect(result.allergyIntolerance?.[0].reference).toBe('AllergyIntolerance/existing')
    expect(mocks.createAllergyIntolerance).not.toHaveBeenCalled()
  })
  it('uses selected existing allergies and rejects missing destination records', async () => {
    const existing: CreateNutritionOrderInput = { ...input, allergies: { mode: 'existing', references: [{ reference: 'AllergyIntolerance/existing' }] } }
    await expect(createPatientNutritionOrder(existing, {})).rejects.toThrow('no longer available')
    mocks.searchPatientAllergies.mockResolvedValue({ entry: [{ resource: { resourceType: 'AllergyIntolerance', id: 'existing', patient: { reference: 'Patient/destination' } } }] })
    expect((await createPatientNutritionOrder(existing, {})).allergyIntolerance?.[0].reference).toBe('AllergyIntolerance/existing')
    expect(mocks.createAllergyIntolerance).not.toHaveBeenCalled()
  })
  it('validates before any write and stops when lookup fails', async () => {
    await expect(createPatientNutritionOrder({ ...input, order: { ...input.order, oralDiet: {} } }, {})).rejects.toThrow('populated')
    expect(mocks.ensureDestinationPatient).not.toHaveBeenCalled()
    mocks.searchPatientAllergies.mockRejectedValue(new Error('Lookup denied'))
    await expect(createPatientNutritionOrder(input, {})).rejects.toThrow('Lookup denied')
    expect(mocks.createAllergyIntolerance).not.toHaveBeenCalled()
    expect(mocks.createNutritionOrder).not.toHaveBeenCalled()
  })
  it('reuses the created patient and allergy when a rejected order is retried', async () => {
    const progress: NutritionCreationProgress = {}
    mocks.ensureDestinationPatient.mockResolvedValue({ patient: { resourceType: 'Patient', id: 'destination' }, created: true })
    mocks.createNutritionOrder.mockRejectedValueOnce(new Error('Profile rejected'))
    await expect(createPatientNutritionOrder(input, progress)).rejects.toThrow('AllergyIntolerance/created-allergy remains')
    expect(progress.patientCreated).toBe(true)
    await createPatientNutritionOrder(input, progress)
    expect(mocks.ensureDestinationPatient).toHaveBeenCalledOnce()
    expect(mocks.createAllergyIntolerance).toHaveBeenCalledOnce()
    expect(mocks.searchPatientAllergies).toHaveBeenCalledOnce()
  })
  it.each(['createAllergyIntolerance', 'createNutritionOrder'] as const)('blocks retry when %s has an uncertain outcome', async (operation) => {
    const progress: NutritionCreationProgress = {}
    mocks[operation].mockRejectedValueOnce(new TypeError('Connection lost'))
    await expect(createPatientNutritionOrder(input, progress)).rejects.toThrow('Verify the destination')
    await expect(createPatientNutritionOrder(input, progress)).rejects.toThrow('uncertain outcome')
    expect(mocks[operation]).toHaveBeenCalledOnce()
  })
  it('supports the same-server patient pattern', async () => {
    mocks.ensureDestinationPatient.mockResolvedValue({ patient: input.patient, created: false })
    const result = await createPatientNutritionOrder({ ...input, destinationBaseUrl: input.sourceBaseUrl }, {})
    expect(result.patient.reference).toBe('Patient/source')
    expect(mocks.createNutritionOrder.mock.calls[0][0]).toBe(input.sourceBaseUrl)
  })
})
