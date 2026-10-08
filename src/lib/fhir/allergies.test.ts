/** Verifies explicit negative-allergy construction and strict reuse eligibility without inferring absence from search results. */
import type { AllergyIntolerance, Bundle } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { buildNoKnownFoodAllergy, eligibleNoKnownFoodAllergy } from './allergies'

const base = 'https://example.test/fhir'
const allergy: AllergyIntolerance = { ...buildNoKnownFoodAllergy({ reference: 'Patient/p' }, '2026-10-08'), id: 'a' }
const bundle = (...resources: AllergyIntolerance[]): Bundle => ({ resourceType: 'Bundle', type: 'searchset', entry: resources.map((resource) => ({ resource })) })
describe('no known food allergies', () => {
  it('creates an explicit standalone record with neither reactions nor invented verification', () => {
    expect(allergy.code?.coding?.[0].code).toBe('429625007')
    expect(allergy.category).toEqual(['food'])
    expect(allergy.reaction).toBeUndefined()
    expect(allergy.verificationStatus).toBeUndefined()
    expect(allergy.patient.reference).toBe('Patient/p')
  })
  it('selects the newest eligible record and handles same-server absolute patient references', () => {
    expect(eligibleNoKnownFoodAllergy(bundle(allergy, { ...allergy, id: 'new', recordedDate: '2026-10-09', patient: { reference: `${base}/Patient/p` } }), 'p', base)?.id).toBe('new')
  })
  it('rejects wrong-patient, wrong-code, inactive, refuted, entered-in-error and id-less records', () => {
    const invalid: AllergyIntolerance[] = [
      { ...allergy, patient: { reference: 'Patient/other' } }, { ...allergy, code: { text: 'No known food allergies' } },
      { ...allergy, code: { coding: [{ system: 'http://snomed.info/sct', code: '160244002' }] } },
      { ...allergy, clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'inactive' }] } },
      { ...allergy, verificationStatus: { coding: [{ code: 'refuted' }] } }, { ...allergy, verificationStatus: { coding: [{ code: 'entered-in-error' }] } }, { ...allergy, id: undefined },
    ]
    expect(eligibleNoKnownFoodAllergy(bundle(...invalid), 'p', base)).toBeUndefined()
    expect(eligibleNoKnownFoodAllergy(bundle(), 'p', base)).toBeUndefined()
  })
})
