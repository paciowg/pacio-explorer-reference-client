/** Verifies standalone allergy and NutritionOrder POST endpoints and IDs returned through representations or headers. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAllergyIntolerance, createNutritionOrder } from './nutritionTransport'
import { buildNoKnownFoodAllergy } from './allergies'

afterEach(() => vi.unstubAllGlobals())
describe('nutrition transport', () => {
  it('posts AllergyIntolerance and NutritionOrder separately with server-assigned IDs', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 201, headers: { Location: '/AllergyIntolerance/allergy/_history/1' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ resourceType: 'NutritionOrder', id: 'order', status: 'draft', intent: 'order', patient: { reference: 'Patient/p' }, dateTime: '2026-10-08' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const allergy = await createAllergyIntolerance('https://example.test', buildNoKnownFoodAllergy({ reference: 'Patient/p' }, '2026-10-08'))
    expect(allergy.id).toBe('allergy')
    const order = await createNutritionOrder('https://example.test', { resourceType: 'NutritionOrder', status: 'draft', intent: 'order', patient: { reference: 'Patient/p' }, dateTime: '2026-10-08', allergyIntolerance: [{ reference: `AllergyIntolerance/${allergy.id}` }] })
    expect(order.id).toBe('order')
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['https://example.test/AllergyIntolerance', 'https://example.test/NutritionOrder'])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).allergyIntolerance).toEqual([{ reference: 'AllergyIntolerance/allergy' }])
  })
  it('reports rejected writes and accepted writes without IDs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ issue: [{ diagnostics: 'Rejected' }] }), { status: 422 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 })))
    const allergy = buildNoKnownFoodAllergy({ reference: 'Patient/p' }, '2026-10-08')
    await expect(createAllergyIntolerance('https://example.test', allergy)).rejects.toThrow('Rejected')
    await expect(createAllergyIntolerance('https://example.test', allergy)).rejects.toThrow('accepted')
  })
})
