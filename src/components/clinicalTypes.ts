/** Defines clinical list item shapes shared by static, navigable, and expandable summaries. */
import type { Resource } from 'fhir/r4'
import type { ResourceDetailModel } from '../lib/fhir/resourceDetails'

export type ClinicalListItem = {
  title: string
  dateLabel?: string
  dateValue?: string
  secondaryText?: string
  resource?: Resource
  details?: ResourceDetailModel | null
}

export type SelectableClinicalListItem = ClinicalListItem & { id: string }
