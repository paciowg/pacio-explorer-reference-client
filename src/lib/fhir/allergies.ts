/** Constructs and identifies explicit no-known-food-allergy statements without inferring them from absent records. */
import type { AllergyIntolerance, Bundle, Reference } from 'fhir/r4'
import { normalizeBaseUrl } from './url'

export const NO_KNOWN_FOOD_ALLERGY_CODE = '429625007'
export const SNOMED_SYSTEM = 'http://snomed.info/sct'

export function buildNoKnownFoodAllergy(patient: Reference, recordedDate: string): AllergyIntolerance {
  if (!patient.reference) throw new Error('A patient reference is required for the allergy statement.')
  return { resourceType: 'AllergyIntolerance', patient, recordedDate, category: ['food'],
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
    code: { coding: [{ system: SNOMED_SYSTEM, code: NO_KNOWN_FOOD_ALLERGY_CODE, display: 'No known food allergy' }], text: 'No known food allergies' } }
}

export function allergyBelongsToPatient(allergy: AllergyIntolerance, patientId: string, baseUrl: string) {
  const reference = allergy.patient?.reference || ''
  const base = normalizeBaseUrl(baseUrl)
  const local = reference.startsWith(`${base}/`) ? reference.slice(base.length + 1) : reference
  return local.replace(/\/_history\/[^/]+$/, '') === `Patient/${patientId}`
}

export function eligibleNoKnownFoodAllergy(bundle: Bundle, patientId: string, baseUrl: string): AllergyIntolerance | undefined {
  return (bundle.entry ?? []).map((entry) => entry.resource).filter((resource): resource is AllergyIntolerance => resource?.resourceType === 'AllergyIntolerance')
    .filter((allergy) => allergy.id && allergyBelongsToPatient(allergy, patientId, baseUrl) &&
      allergy.code?.coding?.some((coding) => coding.system === SNOMED_SYSTEM && coding.code === NO_KNOWN_FOOD_ALLERGY_CODE) &&
      allergy.clinicalStatus?.coding?.some((coding) => coding.system === 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical' && coding.code === 'active') &&
      !allergy.verificationStatus?.coding?.some((coding) => ['refuted', 'entered-in-error'].includes(coding.code || '')))
    .sort((a, b) => (Date.parse(b.recordedDate || '') || 0) - (Date.parse(a.recordedDate || '') || 0) || (a.id || '').localeCompare(b.id || ''))[0]
}
