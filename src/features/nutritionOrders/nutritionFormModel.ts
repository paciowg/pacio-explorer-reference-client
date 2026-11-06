/** Converts demo nutrition form state into typed PFE inputs and validates user-entered quantities, schedules, and references. */
import { resolveOptionReference } from '../../lib/fhir/resourceOptions'
import type { NutritionOrder, Quantity, Timing, TimingRepeat } from 'fhir/r4'
import { calendarDateValue, localDateInputValue } from '../../lib/dateTime'
import { NUTRITION_CHOICES, nutritionConcept } from '../../igs/pacioPfe/nutritionTerminology'
import type { CreateNutritionOrderInput } from './createNutritionOrder'
import { type NutritionReferenceOption } from './nutritionCreateData'
import { issueCollector } from '../../lib/formValidation'

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
  return { status: 'draft', intent: 'order', dateTime: localDateInputValue(), encounter: '', orderer: '',
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

export function validateNutritionForm(form: NutritionForm, options: NutritionReferenceOption[]) {
  const v = issueCollector()
  v.require('allergies', form.allergyMode, 'Select existing allergy records or explicitly choose no known food allergies.')
  if (form.allergyMode === 'existing') {
    v.require('allergies', form.allergies.length, 'Select at least one existing allergy record.')
    form.allergies.forEach((reference) => v.check('allergies', () => resolveOptionReference(options, reference, ['AllergyIntolerance'])))
  }
  v.check('Order date', () => calendarDateValue(form.dateTime, 'order date'))
  for (const [field, reference, types] of [['Encounter', form.encounter, ['Encounter']], ['Orderer', form.orderer, ['Practitioner', 'PractitionerRole']]] as const) {
    v.check(field, () => resolveOptionReference(options, reference, [...types]))
  }
  const quantity = (key: string, label: string, value: QuantityValue) => v.check(`${key}${label}`, () => nutritionQuantity(value))
  const schedule = (key: string, value: ScheduleValue) => {
    v.check(`${key}Times per period`, () => {
      if (!Number.isInteger(positive(value.frequency, 'Frequency'))) throw new Error('Schedule frequency must be a whole number.')
    })
    v.check(`${key}Period length`, () => positive(value.period, 'Schedule period'))
    v.require(`${key}End date`, !value.start || !value.end || value.end >= value.start, 'Schedule end must not precede its start.')
  }
  const concept = (key: string, group: keyof typeof NUTRITION_CHOICES, code: string) => v.check(key, () => nutritionConcept(NUTRITION_CHOICES[group], code))
  if (form.oralEnabled) {
    form.nutrients.forEach((value, index) => {
      concept(`nutrients.${index}.Nutrient modifier`, 'nutrient', value.modifier)
      quantity(`nutrients.${index}.`, 'Nutrient amount', value.amount)
    })
    form.textures.forEach((value, index) => {
      concept(`textures.${index}.Texture modifier`, 'texture', value.modifier)
      concept(`textures.${index}.Texture food type`, 'food', value.food)
    })
  }
  if (form.supplementsEnabled) form.supplements.forEach((value, index) => {
    const key = `supplements.${index}.`
    concept(`${key}Supplement type`, 'supplement', value.type)
    quantity(key, 'Supplement quantity', value.quantity)
    value.schedules.forEach((value, index) => schedule(`${key}schedules.${index}.`, value))
  })
  if (form.enteralEnabled) {
    concept('Base formula type', 'formula', form.formula)
    concept('Additive type', 'additive', form.additive)
    concept('Administration route', 'route', form.route)
    quantity('', 'Caloric density', form.caloricDensity)
    form.administrations.forEach((value, index) => {
      const key = `administrations.${index}.`
      quantity(key, 'Administration quantity', value.quantity)
      value.schedules.forEach((value, index) => schedule(`${key}schedules.${index}.`, value))
      if (value.rateType) {
        v.require(`${key}Rate amount`, value.rate.value.trim(), 'Enter the administration rate.')
        quantity(key, 'Rate amount', value.rate)
      }
      if (value.rateType === 'ratio') {
        v.require(`${key}Rate denominator`, value.denominator.value.trim(), 'Enter the rate denominator.')
        quantity(key, 'Rate denominator', value.denominator)
      }
    })
  }
  const oral = form.oralEnabled && (form.oralTypes.length || form.fluids.length || form.oralInstruction.trim() || form.nutrients.some((n) => n.modifier || n.amount.value.trim()) || form.textures.some((t) => t.modifier || t.food))
  const supplements = form.supplementsEnabled && form.supplements.some((s) => s.type || s.schedules.length || s.quantity.value.trim() || s.instruction.trim())
  const enteral = form.enteralEnabled && (form.formula || form.additive || form.caloricDensity.value.trim() || form.route || form.enteralInstruction.trim() || form.administrations.some((a) => a.schedules.length || a.quantity.value.trim() || a.rateType))
  v.require('components', oral || supplements || enteral, 'Provide at least one populated oral diet, supplement, or enteral formula.')
  return v.issues
}

export function nutritionFormInputs(form: NutritionForm, options: NutritionReferenceOption[]): Pick<CreateNutritionOrderInput, 'order' | 'allergies'> {
  if (!form.allergyMode) throw new Error('Select existing allergy records or explicitly choose no known food allergies.')
  const orderDate = calendarDateValue(form.dateTime, 'order date')
  const concept = (group: keyof typeof NUTRITION_CHOICES, code: string) => nutritionConcept(NUTRITION_CHOICES[group], code)
  const concepts = (group: keyof typeof NUTRITION_CHOICES, codes: string[]) => codes.map((code) => concept(group, code)!).filter(Boolean)
  const order: CreateNutritionOrderInput['order'] = { status: form.status, intent: form.intent, dateTime: orderDate,
    encounter: resolveOptionReference(options, form.encounter, ['Encounter']), orderer: resolveOptionReference(options, form.orderer, ['Practitioner', 'PractitionerRole']),
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
  return { order, allergies: form.allergyMode === 'none-known' ? { mode: 'none-known' } : { mode: 'existing', references: form.allergies.map((reference) => resolveOptionReference(options, reference, ['AllergyIntolerance'])!) } }
}
