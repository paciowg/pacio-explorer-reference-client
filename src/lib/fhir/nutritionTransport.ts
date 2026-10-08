/** Supplies NutritionOrder and AllergyIntolerance creation wrappers over the generic FHIR transport. */
import type { AllergyIntolerance, NutritionOrder } from 'fhir/r4'
import { createResource } from './resourceTransport'

export const createNutritionOrder = (baseUrl: string, order: NutritionOrder) => createResource(baseUrl, order)
export const createAllergyIntolerance = (baseUrl: string, allergy: AllergyIntolerance) => createResource(baseUrl, allergy)
