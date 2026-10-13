/** Updates controlled transfer-list selections while preserving other values and preventing duplicate additions. */
export function transferListSelection(values: string[], value: string, selected: boolean) {
  if (!selected) return values.filter((item) => item !== value)
  return values.includes(value) ? values : [...values, value]
}
