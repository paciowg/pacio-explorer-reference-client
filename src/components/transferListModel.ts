/** Filters presentation labels, compares timestamps, and updates controlled selections without reordering stored values. */
export function filterTransferListOptions<T extends { label: string }>(options: T[], query: string): T[] {
  const search = query.trim().toLowerCase()
  return options.filter((option) => option.label.toLowerCase().includes(search))
}

export function compareTransferListDates(a: { dateValue?: string }, b: { dateValue?: string }) {
  const aDate = Date.parse(a.dateValue || '')
  const bDate = Date.parse(b.dateValue || '')
  const aValid = Number.isFinite(aDate)
  const bValid = Number.isFinite(bDate)
  if (aValid && bValid) return bDate - aDate
  if (aValid !== bValid) return aValid ? -1 : 1
  return 0
}

export function transferListSelection(values: string[], value: string, selected: boolean) {
  if (!selected) return values.filter((item) => item !== value)
  return values.includes(value) ? values : [...values, value]
}
