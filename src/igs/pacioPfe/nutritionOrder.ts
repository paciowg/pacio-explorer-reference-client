/** Constructs PFE NutritionOrders and validates profile-specific requirements independently of presentation and transport. */
import type { NutritionOrder } from 'fhir/r4'

export const PFE_NUTRITION_ORDER_PROFILE = 'http://hl7.org/fhir/us/pacio-pfe/StructureDefinition/pfe-nutrition-order'
export type PFENutritionOrderInput = Pick<NutritionOrder, 'status' | 'intent' | 'patient' | 'dateTime' | 'encounter' | 'orderer' |
  'foodPreferenceModifier' | 'excludeFoodModifier' | 'oralDiet' | 'supplement' | 'enteralFormula'> & { allergyIntolerance: NonNullable<NutritionOrder['allergyIntolerance']> }

/** Removes empty optional structures recursively while preserving FHIR numeric and boolean values. */
function populated(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(populated).filter((item) => item !== undefined)
    return items.length ? items : undefined
  }
  if (value && typeof value === 'object') {
    const fields = Object.entries(value).map(([key, child]) => [key, populated(child)] as const).filter(([, child]) => child !== undefined)
    return fields.length ? Object.fromEntries(fields) : undefined
  }
  return typeof value === 'string' ? value.trim() || undefined : value
}

export function buildPfeNutritionOrder(input: PFENutritionOrderInput): NutritionOrder {
  const fields = populated({ status: input.status, intent: input.intent, patient: input.patient, dateTime: input.dateTime,
    encounter: input.encounter, orderer: input.orderer, allergyIntolerance: input.allergyIntolerance,
    foodPreferenceModifier: input.foodPreferenceModifier, excludeFoodModifier: input.excludeFoodModifier,
    oralDiet: input.oralDiet, supplement: input.supplement, enteralFormula: input.enteralFormula }) as PFENutritionOrderInput
  if (!fields?.status || !fields.intent || !fields.patient?.reference || !fields.dateTime) throw new Error('Status, intent, patient, and order date/time are required.')
  if (!fields.allergyIntolerance?.length || fields.allergyIntolerance.some((reference) => !reference.reference)) throw new Error('At least one allergy reference is required by PFE.')
  if (!fields.oralDiet && !fields.supplement?.length && !fields.enteralFormula) throw new Error('Provide at least one populated oral diet, supplement, or enteral formula.')
  for (const administration of fields.enteralFormula?.administration ?? []) {
    if (administration.rateQuantity && administration.rateRatio) throw new Error('Choose Quantity or Ratio for each administration rate.')
    if (administration.rateRatio?.denominator?.value !== undefined && administration.rateRatio.denominator.value <= 0) throw new Error('Rate denominator must be greater than zero.')
  }
  return { resourceType: 'NutritionOrder', meta: { profile: [PFE_NUTRITION_ORDER_PROFILE] }, ...fields }
}
