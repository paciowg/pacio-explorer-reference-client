/** Defines deliberately small nutrition demo subsets from FHIR R4 value sets and the confirmed PFE example. */
import type { CodeableConcept } from 'fhir/r4'

export type NutritionChoice = { code: string; display: string; system: string }
const snomed = (code: string, display: string): NutritionChoice => ({ code, display, system: 'http://snomed.info/sct' })
export const NUTRITION_CHOICES = {
  diet: [snomed('437421000124105', 'Decreased sodium diet'), snomed('1055201009', 'Decreased protein diet'), snomed('1237451006', 'IDDSI Regular Level 7')],
  nutrient: [snomed('39972003', 'Sodium'), snomed('88480006', 'Potassium'), snomed('33463005', 'Fluid')],
  texture: [snomed('228049004', 'Chopped food'), snomed('228059003', 'Soft food'), snomed('228055009', 'Liquidized food')],
  food: [snomed('226559002', 'Bread'), snomed('227493005', 'Cashew nut')],
  fluid: [snomed('1231508001', 'IDDSI Thin Level 0'), snomed('439021000124105', 'Nectar thick liquids')],
  supplement: [snomed('443481000124101', 'Renal formula'), snomed('443051000124104', 'Adult diabetic specialty formula')],
  formula: [snomed('6547210000124112', 'Diabetic specialty enteral formula')],
  additive: [{ system: 'http://terminology.hl7.org/CodeSystem/entformula-additive', code: 'protein', display: 'Protein' }, { system: 'http://terminology.hl7.org/CodeSystem/entformula-additive', code: 'fiber', display: 'Fiber' }],
  preference: [{ system: 'http://terminology.hl7.org/CodeSystem/diet', code: 'vegetarian', display: 'Vegetarian' }, { system: 'http://terminology.hl7.org/CodeSystem/diet', code: 'halal', display: 'Halal' }],
  route: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration', code: 'NGT', display: 'Nasogastric tube' }, { system: 'http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration', code: 'GT', display: 'Gastrostomy tube' }],
} satisfies Record<string, NutritionChoice[]>

export function nutritionConcept(choices: NutritionChoice[], code: string): CodeableConcept | undefined {
  if (!code) return undefined
  const choice = choices.find((choice) => choice.code === code)
  if (!choice) throw new Error('Select a supported nutrition code.')
  return { coding: [{ ...choice }], text: choice.display }
}
