/** Verifies PFE nutrition requirements, component combinations, and clean FHIR JSON without browser or network dependencies. */
import { describe, expect, it } from 'vitest'
import { buildPfeNutritionOrder, PFE_NUTRITION_ORDER_PROFILE, type PFENutritionOrderInput } from './nutritionOrder'
import { nutritionConcept, NUTRITION_CHOICES } from './nutritionTerminology'

const input: PFENutritionOrderInput = { status: 'draft', intent: 'order', patient: { reference: 'Patient/p' }, dateTime: '2026-10-08T12:30:00Z', allergyIntolerance: [{ reference: 'AllergyIntolerance/a' }] }
const concept = { text: 'Demo nutrition type' }
describe('PFE NutritionOrder reference implementation', () => {
  it.each([
    { oralDiet: { type: [concept] } },
    { supplement: [{ type: concept }, { instruction: 'At breakfast' }] },
    { enteralFormula: { baseFormulaType: concept } },
    { oralDiet: { type: [concept] }, supplement: [{ type: concept }], enteralFormula: { baseFormulaType: concept } },
  ])('builds supported component combinations: %j', (components) => {
    const order = buildPfeNutritionOrder({ ...input, ...components })
    expect(order.meta?.profile).toEqual([PFE_NUTRITION_ORDER_PROFILE])
    expect(order).toMatchObject(components)
    expect(order.contained).toBeUndefined()
  })
  it('requires allergies and a populated component rather than empty optional structures', () => {
    expect(() => buildPfeNutritionOrder({ ...input, allergyIntolerance: [], oralDiet: { instruction: 'Demo' } })).toThrow('allergy reference')
    expect(() => buildPfeNutritionOrder({ ...input, oralDiet: { type: [] }, supplement: [{}], enteralFormula: {} })).toThrow('populated')
    expect(() => buildPfeNutritionOrder({ ...input, dateTime: '', oralDiet: { instruction: 'Demo' } })).toThrow('date/time')
  })
  it('omits empty nested FHIR elements and preserves all supported fields', () => {
    const order = buildPfeNutritionOrder({ ...input, encounter: { reference: 'Encounter/e' }, orderer: { reference: 'PractitionerRole/r' }, foodPreferenceModifier: [],
      oralDiet: { type: [concept], nutrient: [{ modifier: concept, amount: { value: 0, unit: 'mg' } }], texture: [{ modifier: concept, foodType: concept }], fluidConsistencyType: [concept], instruction: ' Eat slowly ' },
      supplement: [{ type: concept, schedule: [{ repeat: { frequency: 1, period: 1, periodUnit: 'd' } }], quantity: { value: 200, unit: 'mL' }, instruction: '' }],
      enteralFormula: { baseFormulaType: concept, additiveType: concept, caloricDensity: { value: 1.5, unit: 'kcal/mL' }, routeofAdministration: concept, administration: [{ rateQuantity: { value: 60, unit: 'mL/h' } }], administrationInstruction: 'Overnight' } })
    expect(JSON.stringify(order)).not.toContain('[]')
    expect(order.oralDiet?.instruction).toBe('Eat slowly')
    expect(order.oralDiet?.nutrient?.[0].amount?.value).toBe(0)
    expect(order.supplement?.[0].instruction).toBeUndefined()
    expect(order.enteralFormula?.administration).toHaveLength(1)
  })
  it('enforces rate choice exclusivity and a positive ratio denominator', () => {
    expect(() => buildPfeNutritionOrder({ ...input, enteralFormula: { administration: [{ rateQuantity: { value: 1 }, rateRatio: { numerator: { value: 2 }, denominator: { value: 3 } } }] } })).toThrow('Quantity or Ratio')
    expect(() => buildPfeNutritionOrder({ ...input, enteralFormula: { administration: [{ rateRatio: { denominator: { value: 0 } } }] } })).toThrow('greater than zero')
  })
  it('uses the verified HL7 additive and route code systems', () => {
    expect(nutritionConcept(NUTRITION_CHOICES.additive, 'fiber')).toMatchObject({ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/entformula-additive', code: 'fiber' }] })
    expect(nutritionConcept(NUTRITION_CHOICES.route, 'NGT')?.coding?.[0].code).toBe('NGT')
  })
})
