/** Verifies patient scoping, historical generic nutrition display, reference resolution, and accessible typed summaries. */
import type { AllergyIntolerance, Bundle, NutritionOrder } from 'fhir/r4'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getPatientNutritionOrders } from './nutritionModel'
import { NutritionOrdersSection } from './NutritionOrdersSection'
import { NutritionOrderForm } from './NutritionOrderForm'
import { initialNutritionForm, newAdministration, newSupplement } from './nutritionFormModel'

const order: NutritionOrder = { resourceType: 'NutritionOrder', id: 'order', status: 'completed', intent: 'order', patient: { reference: 'Patient/p' }, dateTime: '2026-10-08',
  oralDiet: { type: [{ text: 'Soft diet' }], nutrient: [{ modifier: { text: 'Sodium' }, amount: { value: 2, unit: 'g' } }] },
  supplement: [{ type: { text: 'Renal formula' }, instruction: 'At lunch' }],
  enteralFormula: { baseFormulaType: { text: 'Formula' }, administration: [{ rateRatio: { numerator: { value: 200, unit: 'mL' }, denominator: { value: 4, unit: 'h' } } }] } }

describe('nutrition order viewing', () => {
  it('retains generic historical orders, resolves contained allergies and scopes the patient', () => {
    const allergy: AllergyIntolerance = { resourceType: 'AllergyIntolerance', id: 'local', patient: order.patient, code: { text: 'No known food allergies' } }
    const bundle: Bundle = { resourceType: 'Bundle', type: 'collection', entry: [
      { resource: { ...order, contained: [allergy], allergyIntolerance: [{ reference: '#local' }] } as NutritionOrder },
      { resource: { ...order, id: 'other', patient: { reference: 'Patient/other' } } as NutritionOrder },
    ] }
    const items = getPatientNutritionOrders(bundle, 'p', 'https://example.test')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Soft diet · Renal formula · Formula')
    expect(items[0].secondaryText).toContain('completed')
    const fields = items[0].details?.groups.flatMap((group) => group.fields)
    expect(fields).toContainEqual({ label: 'Allergies and intolerances', values: ['No known food allergies'] })
    expect(fields).toContainEqual({ label: 'Rate', values: ['200 mL / 4 h'] })
  })
  it('supports absolute historical patient references, unresolved allergies, deduplication and no ten-item cap', () => {
    const bundle: Bundle = { resourceType: 'Bundle', type: 'collection', entry: Array.from({ length: 12 }, (_, index) => ({ resource: { ...order, id: `${index}`, patient: { reference: 'https://example.test/Patient/p/_history/1' }, allergyIntolerance: [{ reference: 'AllergyIntolerance/missing' }] } as NutritionOrder })) }
    bundle.entry!.push(bundle.entry![0])
    const items = getPatientNutritionOrders(bundle, 'p', 'https://example.test')
    expect(items).toHaveLength(12)
    expect(items[0].details?.groups.flatMap((group) => group.fields)).toContainEqual({ label: 'Allergies and intolerances', values: ['AllergyIntolerance/missing'] })
    expect(getPatientNutritionOrders(null, 'p', 'https://example.test')).toEqual([])
  })
  it('renders the resource type before expansion and includes the creation action', () => {
    const items = getPatientNutritionOrders({ resourceType: 'Bundle', type: 'collection', entry: [{ resource: order }] }, 'p', 'https://example.test')
    const html = renderToStaticMarkup(<NutritionOrdersSection items={items} patientId="p" emptyMessage="None recorded" />)
    expect(html.slice(html.indexOf('<summary>'), html.indexOf('</summary>'))).toContain('NutritionOrder')
    expect(html).not.toContain('<details open')
    expect(html).toContain('Create Nutrition Order')
    expect(renderToStaticMarkup(<NutritionOrdersSection items={[]} patientId="p" emptyMessage="Unavailable" />)).toContain('Unavailable')
  })
  it('shows schedule ranges and meal timing without inventing a repeat interval', () => {
    const scheduled: NutritionOrder = { ...order, oralDiet: { schedule: [{ repeat: { frequency: 2, frequencyMax: 3, when: ['AC'] } }] } }
    const items = getPatientNutritionOrders({ resourceType: 'Bundle', type: 'collection', entry: [{ resource: scheduled }] }, 'p', 'https://example.test')
    const schedule = items[0].details?.groups.flatMap((group) => group.fields).find((field) => field.label === 'Schedule')
    expect(schedule?.values).toEqual(['2–3 time(s) · AC'])
  })
  it('renders all three component controls and two unselected allergy choices', () => {
    const form = { ...initialNutritionForm(), oralEnabled: true, supplementsEnabled: true, supplements: [newSupplement()], enteralEnabled: true, administrations: [newAdministration()] }
    const html = renderToStaticMarkup(<NutritionOrderForm value={form} options={[]} disabled={false} allergyLocked={false} onChange={() => {}} />)
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html).not.toContain('type="radio" checked')
    for (const label of ['Nutrient modifications', 'Textures', 'Supplement quantity', 'Caloric density', 'Administration route', 'Rate representation']) expect(html).toContain(label)
  })
})
