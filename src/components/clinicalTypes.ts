export type ClinicalListItem = {
  title: string
  dateLabel?: string
  dateValue?: string
  secondaryText?: string
}

export type SelectableClinicalListItem = ClinicalListItem & { id: string }
