/** Selects typed patient NutritionOrder summaries with generic, reference-aware expanded details. */
import type { Bundle, NutritionOrder } from 'fhir/r4'
import type { ClinicalListItem } from '../../components/clinicalTypes'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { buildResourceDetailModel, type ResolveResourceReference } from '../../lib/fhir/resourceDetails'
import { getSimpleResourceDisplay } from '../../lib/fhir/resourceDisplay'
import { formatDate } from '../../lib/fhir/formatters'
import { normalizeBaseUrl } from '../../lib/fhir/url'
import { compareClinicalDatesDesc } from '../../lib/dateTime'

export function getPatientNutritionOrders(bundle: Bundle | null, patientId: string, baseUrl: string): ClinicalListItem[] {
  if (!bundle) return []
  const index = createBundleIndex(bundle, baseUrl)
  const local = (reference: string = '') => (reference.startsWith(`${normalizeBaseUrl(baseUrl)}/`) ? reference.slice(normalizeBaseUrl(baseUrl).length + 1) : reference).replace(/\/_history\/[^/]+$/, '')
  const resolve: ResolveResourceReference = (reference, owner) => index.resolve(reference, owner) || index.resolve(local(reference), owner)
  const seen = new Set<string>()
  return (bundle.entry ?? []).map((entry) => entry.resource).filter((resource): resource is NutritionOrder => resource?.resourceType === 'NutritionOrder')
    .filter((order) => local(order.patient?.reference) === `Patient/${patientId}` || (resolve(order.patient?.reference)?.resourceType === 'Patient' && resolve(order.patient?.reference)?.id === patientId))
    .filter((order) => {
      if (!order.id) return true
      if (seen.has(order.id)) return false
      seen.add(order.id)
      return true
    }).sort((a, b) => compareClinicalDatesDesc(a.dateTime, b.dateTime, a.meta?.lastUpdated, b.meta?.lastUpdated))
    .map((order) => ({ resource: order, title: getSimpleResourceDisplay(order),
      secondaryText: [order.oralDiet ? 'Oral diet' : '', order.supplement?.length ? 'Supplements' : '', order.enteralFormula ? 'Enteral formula' : '', order.status].filter(Boolean).join(' · '),
      dateLabel: order.dateTime ? 'Ordered' : undefined, dateValue: order.dateTime ? formatDate(order.dateTime) : undefined,
      details: buildResourceDetailModel(order, resolve) }))
}
