/** Coordinates destination Patient, optional standalone allergy creation, and NutritionOrder publication with in-session retry state. */
import type { AllergyIntolerance, Patient, Reference } from 'fhir/r4'
import { buildPfeNutritionOrder, type PFENutritionOrderInput } from '../../igs/pacioPfe/nutritionOrder'
import { buildNoKnownFoodAllergy, eligibleNoKnownFoodAllergy } from '../../lib/fhir/allergies'
import { ensureDestinationPatient } from '../../lib/fhir/destinationPatient'
import { createAllergyIntolerance, createNutritionOrder } from '../../lib/fhir/nutritionTransport'
import { searchPatientAllergies } from './nutritionCreateData'

export type NutritionAllergySelection = { mode: 'existing'; references: Reference[] } | { mode: 'none-known' }
export type NutritionCreationProgress = { patient?: Patient; patientCreated?: boolean; allergies?: Reference[]; createdAllergy?: AllergyIntolerance; uncertain?: boolean }
export type CreateNutritionOrderInput = {
  sourceBaseUrl: string; destinationBaseUrl: string; patient: Patient; recordedAt: string
  order: Omit<PFENutritionOrderInput, 'patient' | 'allergyIntolerance'>
  allergies: NutritionAllergySelection
}

function uncertain(error: unknown) {
  return error instanceof TypeError || error instanceof SyntaxError || (error instanceof Error && error.message.includes('accepted'))
}

export async function createPatientNutritionOrder(input: CreateNutritionOrderInput, progress: NutritionCreationProgress) {
  if (progress.uncertain) throw new Error('A previous write has an uncertain outcome. Verify the destination before starting another submission.')
  const initialAllergies = input.allergies.mode === 'existing' ? input.allergies.references : [{ reference: 'AllergyIntolerance/pending' }]
  buildPfeNutritionOrder({ ...input.order, patient: { reference: `Patient/${input.patient.id || 'pending'}` }, allergyIntolerance: initialAllergies })
  if (!progress.patient) {
    try {
      const result = await ensureDestinationPatient(input)
      progress.patient = result.patient
      progress.patientCreated = result.created
    }
    catch (error) { if (uncertain(error)) progress.uncertain = true; throw error }
  }
  const patient = { reference: `Patient/${progress.patient.id}` }
  if (!progress.allergies) {
    const bundle = await searchPatientAllergies(input.destinationBaseUrl, progress.patient.id!)
    if (input.allergies.mode === 'existing') {
      for (const reference of input.allergies.references) {
        if (!bundle.entry?.some((entry) => `AllergyIntolerance/${entry.resource?.id}` === reference.reference)) throw new Error('A selected allergy is no longer available for the destination patient.')
      }
      progress.allergies = input.allergies.references
    } else {
      let allergy = eligibleNoKnownFoodAllergy(bundle, progress.patient.id!, input.destinationBaseUrl)
      if (!allergy) {
        try {
          allergy = await createAllergyIntolerance(input.destinationBaseUrl, buildNoKnownFoodAllergy(patient, input.recordedAt))
          progress.createdAllergy = allergy
        } catch (error) {
          if (uncertain(error)) progress.uncertain = true
          throw new Error(`Unable to create the no-known-food-allergy record: ${error instanceof Error ? error.message : 'Unknown error'}${progress.uncertain ? ' Verify the destination before retrying.' : ''}`)
        }
      }
      progress.allergies = [{ reference: `AllergyIntolerance/${allergy.id}`, display: 'No known food allergies' }]
    }
  }
  try { return await createNutritionOrder(input.destinationBaseUrl, buildPfeNutritionOrder({ ...input.order, patient, allergyIntolerance: progress.allergies })) }
  catch (error) {
    if (uncertain(error)) progress.uncertain = true
    const retained = progress.createdAllergy ? `AllergyIntolerance/${progress.createdAllergy.id} remains on the destination. ` : ''
    throw new Error(`${retained}NutritionOrder creation failed: ${error instanceof Error ? error.message : 'Unknown error'}${progress.uncertain ? ' Verify the destination before retrying.' : ''}`)
  }
}
