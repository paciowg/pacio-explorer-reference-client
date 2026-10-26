/** Supplies local calendar dates, compares raw dates, and formats zoned timestamps without assigning instants to date-only values. */
export function compareDatesDesc(a: string | undefined, b: string | undefined) {
  const aDate = Date.parse(a || '')
  const bDate = Date.parse(b || '')
  const aValid = Number.isFinite(aDate)
  const bValid = Number.isFinite(bDate)
  if (aValid && bValid) return bDate - aDate
  if (aValid !== bValid) return aValid ? -1 : 1
  return 0
}

/** Breaks clinical-date ties by update time while preserving the order of undated entries. */
export function compareClinicalDatesDesc(
  a: string | undefined,
  b: string | undefined,
  aLastUpdated: string | undefined,
  bLastUpdated: string | undefined,
) {
  const clinicalOrder = compareDatesDesc(a, b)
  if (clinicalOrder || !Number.isFinite(Date.parse(a || ''))) return clinicalOrder
  return compareDatesDesc(aLastUpdated, bLastUpdated)
}

export function localDateInputValue(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function calendarDateValue(value: string, label = 'date') {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = new Date(`${value}T00:00:00Z`)
  if (!match || Number(match[1]) < 1 || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Enter a valid ${label}.`)
  }
  return value
}

export function formatLocalTimestamp(value: string) {
  // FHIR dates, partial dates, and standalone times do not identify a zoned instant.
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return value
  try {
    calendarDateValue(match[1])
  } catch {
    return value
  }
  const date = new Date(value)
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 || !Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  }).format(date)
}
