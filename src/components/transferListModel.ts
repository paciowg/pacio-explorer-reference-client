/** Updates controlled selections and compares presentation timestamps without reordering stored selection values. */
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
