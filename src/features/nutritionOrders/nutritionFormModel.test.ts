/** Verifies explicit allergy decisions, component conversion, and quantity/schedule validation before nutrition writes. */
import { describe, expect, it } from 'vitest'
import { buildPfeNutritionOrder } from '../../igs/pacioPfe/nutritionOrder'
import { emptyQuantity, initialNutritionForm, newAdministration, newSchedule, newSupplement, nutritionFormInputs, nutritionQuantity, nutritionSchedule } from './nutritionFormModel'

describe('nutrition form conversion', () => {
  it('does not preselect an allergy assertion or clinical components', () => {
    const form = initialNutritionForm()
    expect(form.allergyMode).toBe('')
    expect(form.oralEnabled || form.enteralEnabled || form.supplementsEnabled).toBe(false)
    expect(() => nutritionFormInputs(form, [])).toThrow('explicitly choose')
  })
  it('converts all three component groups with repeatable quantities and rate choices', () => {
    const form = initialNutritionForm()
    Object.assign(form, { allergyMode: 'none-known', dateTime: '2026-10-08T12:30', oralEnabled: true, oralTypes: ['437421000124105'],
      nutrients: [{ modifier: '39972003', amount: { value: '2', unit: 'g' } }], textures: [{ modifier: '228049004', food: '226559002' }], fluids: ['1231508001'],
      supplementsEnabled: true, supplements: [{ ...newSupplement(), type: '443481000124101', schedules: [newSchedule()], quantity: { value: '200', unit: 'mL' } }, { ...newSupplement(), instruction: 'With lunch' }],
      enteralEnabled: true, formula: '6547210000124112', additive: 'fiber', route: 'NGT', caloricDensity: { value: '1.5', unit: 'kcal/mL' },
      administrations: [{ ...newAdministration(), rateType: 'quantity', rate: { value: '60', unit: 'mL/h' } }, { ...newAdministration(), rateType: 'ratio', rate: { value: '200', unit: 'mL' }, denominator: { value: '4', unit: 'h' } }] })
    const result = nutritionFormInputs(form, [])
    expect(result.order.dateTime).toBe('2026-10-08T12:30:00.000Z')
    expect(result.allergies).toEqual({ mode: 'none-known' })
    expect(result.order.oralDiet?.nutrient?.[0].amount).toMatchObject({ value: 2, system: 'http://unitsofmeasure.org', code: 'g' })
    expect(result.order.supplement).toHaveLength(2)
    expect(result.order.enteralFormula?.administration?.[0].rateRatio).toBeUndefined()
    expect(result.order.enteralFormula?.administration?.[1].rateRatio?.denominator?.value).toBe(4)
  })
  it('omits disabled components and does not count an enabled empty component', () => {
    const form = { ...initialNutritionForm(), allergyMode: 'none-known' as const, oralEnabled: true }
    const result = nutritionFormInputs(form, [])
    expect(() => buildPfeNutritionOrder({ ...result.order, patient: { reference: 'Patient/p' }, allergyIntolerance: [{ reference: 'AllergyIntolerance/a' }] })).toThrow('populated')
    expect(nutritionFormInputs({ ...form, oralEnabled: false, oralTypes: ['437421000124105'] }, []).order.oralDiet).toBeUndefined()
  })
  it('rejects stale references, invalid dates, nonpositive quantities and malformed schedules', () => {
    expect(() => nutritionFormInputs({ ...initialNutritionForm(), allergyMode: 'existing', allergies: ['AllergyIntolerance/source'] }, [])).toThrow('no longer available')
    expect(() => nutritionFormInputs({ ...initialNutritionForm(), allergyMode: 'none-known', dateTime: '' }, [])).toThrow('date and time')
    expect(() => nutritionQuantity({ value: '-1', unit: 'mL' })).toThrow('positive number')
    expect(() => nutritionQuantity({ value: 'abc', unit: 'mL' })).toThrow('positive number')
    expect(() => nutritionQuantity({ value: '1', unit: 'unknown' })).toThrow('UCUM')
    expect(nutritionQuantity(emptyQuantity())).toBeUndefined()
    expect(() => nutritionSchedule({ ...newSchedule(), frequency: '1.5' })).toThrow('whole number')
    expect(() => nutritionSchedule({ ...newSchedule(), start: '2026-10-09', end: '2026-10-08' })).toThrow('end must not precede')
  })
  it('requires a denominator for a ratio and supports only one schedule per administration', () => {
    const form = { ...initialNutritionForm(), allergyMode: 'none-known' as const, enteralEnabled: true, administrations: [{ ...newAdministration(), rateType: 'ratio' as const, rate: { value: '200', unit: 'mL' } }] }
    expect(() => nutritionFormInputs(form, [])).toThrow('denominator')
    expect(() => nutritionFormInputs({ ...form, administrations: [{ ...newAdministration(), schedules: [newSchedule(), newSchedule()] }] }, [])).toThrow('one schedule')
  })
})
