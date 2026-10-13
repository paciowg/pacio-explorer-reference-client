/** Verifies direct destination-patient allergy searches, choice loading, and failure handling before any nutrition writes. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findDestinationPatient: vi.fn(), searchResources: vi.fn() }))
vi.mock('../../lib/fhir/destinationPatient', () => ({ findDestinationPatient: mocks.findDestinationPatient }))
vi.mock('../../lib/fhir/resourceTransport', async (importOriginal) => ({ ...await importOriginal<typeof import('../../lib/fhir/resourceTransport')>(), searchResources: mocks.searchResources }))
import { loadNutritionCreateData, nutritionReference, searchPatientAllergies } from './nutritionCreateData'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.findDestinationPatient.mockResolvedValue({ resourceType: 'Patient', id: 'destination' })
  mocks.searchResources.mockResolvedValue({ resourceType: 'Bundle', type: 'searchset', entry: [] })
})
describe('nutrition destination choices', () => {
  it('prefers roles, distinguishes multiple roles, and retains practitioners without a destination role', async () => {
    mocks.searchResources.mockImplementation(async (_base, type) => ({ resourceType: 'Bundle', type: 'searchset', entry: (type === 'Practitioner' ? [
      { resourceType: 'Practitioner', id: 'covered', name: [{ text: 'Alex Smith' }] },
      { resourceType: 'Practitioner', id: 'standalone', name: [{ text: 'Jamie Jones' }] },
      { resourceType: 'Practitioner', id: 'external', name: [{ text: 'Taylor Lee' }] },
    ] : type === 'PractitionerRole' ? [
      { resourceType: 'PractitionerRole', id: 'dietitian', practitioner: { reference: 'Practitioner/covered' }, code: [{ text: 'Dietitian' }] },
      { resourceType: 'PractitionerRole', id: 'physician', practitioner: { reference: 'https://destination.test/Practitioner/covered/_history/2' }, code: [{ text: 'Physician' }] },
      { resourceType: 'PractitionerRole', id: 'unresolved', practitioner: { reference: 'Practitioner/missing' }, code: [{ text: 'Nutrition specialist' }] },
      { resourceType: 'PractitionerRole', id: 'outside', practitioner: { reference: 'https://other.test/Practitioner/external' }, code: [{ text: 'External clinician' }] },
    ] : []).map((resource) => ({ resource })) }))
    const { options } = await loadNutritionCreateData('https://source.test', 'https://destination.test', { resourceType: 'Patient', id: 'source' })
    expect(options.map((option) => option.reference)).not.toContain('Practitioner/covered')
    expect(options.map((option) => option.reference)).toEqual(expect.arrayContaining(['Practitioner/standalone', 'Practitioner/external', 'PractitionerRole/unresolved', 'PractitionerRole/outside']))
    expect(options.find((option) => option.reference === 'PractitionerRole/dietitian')?.label).toBe('PractitionerRole: Alex Smith — Dietitian')
    expect(options.find((option) => option.reference === 'PractitionerRole/physician')?.label).toBe('PractitionerRole: Alex Smith — Physician')
    expect(nutritionReference(options, 'PractitionerRole/dietitian', ['Practitioner', 'PractitionerRole'])).toEqual({ reference: 'PractitionerRole/dietitian', display: 'Alex Smith — Dietitian' })
    expect(nutritionReference(options.map((option) => ({ ...option, label: 'Changed UI label' })), 'PractitionerRole/dietitian', ['Practitioner', 'PractitionerRole'])?.display).toBe('Alex Smith — Dietitian')
    expect(nutritionReference(options, 'Practitioner/standalone', ['Practitioner', 'PractitionerRole'])?.reference).toBe('Practitioner/standalone')
  })
  it('loads allergies directly for the matched Patient, filtering other-patient results', async () => {
    mocks.searchResources.mockImplementation(async (_base, type) => ({ resourceType: 'Bundle', type: 'searchset', entry: type === 'AllergyIntolerance' ? [
      { resource: { resourceType: 'AllergyIntolerance', id: 'right', patient: { reference: 'Patient/destination' } } },
      { resource: { resourceType: 'AllergyIntolerance', id: 'wrong', patient: { reference: 'Patient/source' } } },
    ] : [] }))
    const data = await loadNutritionCreateData('https://source.test', 'https://destination.test', { resourceType: 'Patient', id: 'source' })
    expect(mocks.searchResources).toHaveBeenCalledWith('https://destination.test', 'AllergyIntolerance', { patient: 'destination' })
    expect(data.options.map((option) => option.reference)).toEqual(['AllergyIntolerance/right'])
  })
  it('does not create or perform patient-specific searches when a matching Patient is absent', async () => {
    mocks.findDestinationPatient.mockResolvedValue(null)
    const data = await loadNutritionCreateData('source', 'destination', { resourceType: 'Patient', id: 'source' })
    expect(data.patient).toBeNull()
    expect(mocks.searchResources.mock.calls.map((call) => call[1])).toEqual(['Practitioner', 'PractitionerRole'])
  })
  it('propagates allergy-search errors while reporting optional Encounter failures', async () => {
    mocks.searchResources.mockImplementation(async (_base, type) => {
      if (type === 'AllergyIntolerance') throw new Error('Allergy search denied')
      return { resourceType: 'Bundle', type: 'searchset', entry: [] }
    })
    await expect(loadNutritionCreateData('source', 'destination', { resourceType: 'Patient', id: 'source' })).rejects.toThrow('Allergy search denied')
    mocks.searchResources.mockImplementation(async (_base, type) => {
      if (type === 'Encounter') throw new Error('Unsupported')
      return { resourceType: 'Bundle', type: 'searchset', entry: [] }
    })
    expect((await loadNutritionCreateData('source', 'destination', { resourceType: 'Patient', id: 'source' })).warning).toContain('Encounter choices')
  })
  it('does not treat an incomplete allergy search as absence', async () => {
    mocks.searchResources.mockResolvedValue({ resourceType: 'Bundle', type: 'searchset', link: [{ relation: 'next', url: 'next' }] })
    await expect(searchPatientAllergies('destination', 'p')).rejects.toThrow('retrieval limit')
  })
})
