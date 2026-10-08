/** Converts demo nutrition form state into typed PFE inputs and validates user-entered quantities, schedules, and references. */
import type { NutritionOrder, Quantity, Timing, TimingRepeat } from 'fhir/r4'
import { NUTRITION_CHOICES, nutritionConcept } from '../../igs/pacioPfe/nutritionTerminology'
import type { CreateNutritionOrderInput } from './createNutritionOrder'
import { nutritionReference, type NutritionReferenceOption } from './nutritionCreateData'

export type QuantityValue = { value: string; unit: string }
export type ScheduleValue = { frequency: string; period: string; unit: NonNullable<TimingRepeat['periodUnit']>; start: string; end: string }
export type NutrientValue = { modifier: string; amount: QuantityValue }
export type TextureValue = { modifier: string; food: string }
export type SupplementValue = { type: string; schedules: ScheduleValue[]; quantity: QuantityValue; instruction: string }
export type AdministrationValue = { schedules: ScheduleValue[]; quantity: QuantityValue; rateType: '' | 'quantity' | 'ratio'; rate: QuantityValue; denominator: QuantityValue }
export type NutritionForm = {
  status: NutritionOrder['status']; intent: NutritionOrder['intent']; dateTime: string; encounter: string; orderer: string
  allergyMode: '' | 'existing' | 'none-known'; allergies: string[]; preferences: string[]; excludedFoods: string[]
  oralEnabled: boolean; oralTypes: string[]; nutrients: NutrientValue[]; textures: TextureValue[]; fluids: string[]; oralInstruction: string
  supplementsEnabled: boolean; supplements: SupplementValue[]
  enteralEnabled: boolean; formula: string; additive: string; caloricDensity: QuantityValue; route: string; administrations: AdministrationValue[]; enteralInstruction: string
}

export const UCUM_UNITS = ['mg', 'g', 'mL', 'kcal/mL', 'mL/h', 'h', 'd'] as const
export const emptyQuantity = (unit = 'mL'): QuantityValue => ({ value: '', unit })
export const newSchedule = (): ScheduleValue => ({ frequency: '1', period: '1', unit: 'd', start: '', end: '' })
export const newSupplement = (): SupplementValue => ({ type: '', schedules: [], quantity: emptyQuantity(), instruction: '' })
export const newAdministration = (): AdministrationValue => ({ schedules: [], quantity: emptyQuantity(), rateType: '', rate: emptyQuantity('mL/h'), denominator: emptyQuantity('h') })
export function initialNutritionForm(): NutritionForm {
  return { status: 'draft', intent: 'order', dateTime: new Date().toISOString().slice(0, 16), encounter: '', orderer: '',
    allergyMode: '', allergies: [], preferences: [], excludedFoods: [], oralEnabled: false, oralTypes: [], nutrients: [], textures: [], fluids: [], oralInstruction: '',
    supplementsEnabled: false, supplements: [], enteralEnabled: false, formula: '', additive: '', caloricDensity: emptyQuantity('kcal/mL'), route: '', administrations: [], enteralInstruction: '' }
}

function positive(value: string, label: string) {
  const number = Number(value)
  if (!value.trim() || !Number.isFinite(number) || number <= 0) throw new Error(`${label} must be a positive number.`)
  return number
}

export function nutritionQuantity(input: QuantityValue): Quantity | undefined {
  if (!input.value.trim()) return undefined
  if (!UCUM_UNITS.includes(input.unit as typeof UCUM_UNITS[number])) throw new Error('Select a supported UCUM unit.')
  return { value: positive(input.value, 'Quantity'), unit: input.unit, system: 'http://unitsofmeasure.org', code: input.unit }
}

export function nutritionSchedule(input: ScheduleValue): Timing {
  const frequency = positive(input.frequency, 'Frequency')
  if (!Number.isInteger(frequency)) throw new Error('Schedule frequency must be a whole number.')
  if (input.start && input.end && input.end < input.start) throw new Error('Schedule end must not precede its start.')
  return { repeat: { frequency, period: positive(input.period, 'Schedule period'), periodUnit: input.unit,
    ...(input.start || input.end ? { boundsPeriod: { ...(input.start ? { start: input.start } : {}), ...(input.end ? { end: input.end } : {}) } } : {}) } }
}

export function nutritionFormInputs(form: NutritionForm, options: NutritionReferenceOption[]): Pick<CreateNutritionOrderInput, 'order' | 'allergies'> {
  if (!form.allergyMode) throw new Error('Select existing allergy records or explicitly choose no known food allergies.')
  if (!form.dateTime.trim()) throw new Error('Enter the order date and time.')
  const instant = new Date(`${form.dateTime}Z`)
  if (!Number.isFinite(instant.getTime())) throw new Error('Enter a valid order date and time.')
  const concept = (group: keyof typeof NUTRITION_CHOICES, code: string) => nutritionConcept(NUTRITION_CHOICES[group], code)
  const concepts = (group: keyof typeof NUTRITION_CHOICES, codes: string[]) => codes.map((code) => concept(group, code)!).filter(Boolean)
  const order: CreateNutritionOrderInput['order'] = { status: form.status, intent: form.intent, dateTime: instant.toISOString(),
    encounter: nutritionReference(options, form.encounter, ['Encounter']), orderer: nutritionReference(options, form.orderer, ['Practitioner', 'PractitionerRole']),
    foodPreferenceModifier: concepts('preference', form.preferences), excludeFoodModifier: concepts('food', form.excludedFoods) }
  if (form.oralEnabled) order.oralDiet = { type: concepts('diet', form.oralTypes), nutrient: form.nutrients.map((nutrient) => ({ modifier: concept('nutrient', nutrient.modifier), amount: nutritionQuantity(nutrient.amount) })),
    texture: form.textures.map((texture) => ({ modifier: concept('texture', texture.modifier), foodType: concept('food', texture.food) })), fluidConsistencyType: concepts('fluid', form.fluids), instruction: form.oralInstruction }
  if (form.supplementsEnabled) order.supplement = form.supplements.map((supplement) => ({ type: concept('supplement', supplement.type), schedule: supplement.schedules.map(nutritionSchedule), quantity: nutritionQuantity(supplement.quantity), instruction: supplement.instruction }))
  if (form.enteralEnabled) order.enteralFormula = { baseFormulaType: concept('formula', form.formula), additiveType: concept('additive', form.additive),
    caloricDensity: nutritionQuantity(form.caloricDensity), routeofAdministration: concept('route', form.route), administrationInstruction: form.enteralInstruction,
    administration: form.administrations.map((administration) => {
      if (administration.schedules.length > 1) throw new Error('Each enteral administration supports one schedule. Add another administration for a different schedule.')
      const rate = administration.rateType ? nutritionQuantity(administration.rate) : undefined
      if (administration.rateType && !rate) throw new Error('Enter the administration rate.')
      const denominator = administration.rateType === 'ratio' ? nutritionQuantity(administration.denominator) : undefined
      if (administration.rateType === 'ratio' && !denominator) throw new Error('Enter the rate denominator.')
      return { schedule: administration.schedules[0] ? nutritionSchedule(administration.schedules[0]) : undefined, quantity: nutritionQuantity(administration.quantity),
        ...(administration.rateType === 'quantity' ? { rateQuantity: rate } : administration.rateType === 'ratio' ? { rateRatio: { numerator: rate, denominator } } : {}) }
    }) }
  return { order, allergies: form.allergyMode === 'none-known' ? { mode: 'none-known' } : { mode: 'existing', references: form.allergies.map((reference) => nutritionReference(options, reference, ['AllergyIntolerance'])!) } }
}
