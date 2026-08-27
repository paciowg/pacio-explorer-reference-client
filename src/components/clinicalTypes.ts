/** Defines presentation-only list item shapes shared by clinical-summary components. */
export type ClinicalListItem = {
  title: string
  dateLabel?: string
  dateValue?: string
  secondaryText?: string
}

export type SelectableClinicalListItem = ClinicalListItem & { id: string }
