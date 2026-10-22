/** Presents controlled multi-selection with independently searchable panes without owning option loading or validation. */
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { compareTransferListDates, filterTransferListOptions, transferListSelection } from './transferListModel'
import { formatDate } from '../lib/fhir/formatters'

type Option = { value: string; label: string; dateValue?: string; dateLabel?: string }
type Props = { label: string; options: Option[]; values: string[]; disabled?: boolean; showDates?: boolean; onChange: (values: string[]) => void }

export function TransferList({ label, options, values, disabled = false, showDates = false, onChange }: Props) {
  const id = useId()
  const [queries, setQueries] = useState({ available: '', selected: '' })
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const searchInputs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocus = useRef<{ value: string; source: string } | null>(null)
  const selectedValues = new Set(values)
  const optionsByValue = new Map(options.map((option) => [option.value, option]))
  const available = options.filter((option) => !selectedValues.has(option.value))
  // Keep stale selections visible and removable; callers still own reference validation.
  const selected = [...selectedValues].map((value) => optionsByValue.get(value) || { value, label: `${value} (Unavailable)` })
  if (showDates) {
    available.sort(compareTransferListDates)
    selected.sort(compareTransferListDates)
  }
  const visibleAvailable = filterTransferListOptions(available, queries.available)
  const visibleSelected = filterTransferListOptions(selected, queries.selected)

  const dateText = (option: Option) => option.dateValue && Number.isFinite(Date.parse(option.dateValue))
    ? `${option.dateLabel || 'Date'}: ${formatDate(option.dateValue)}` : 'Date unavailable'

  useLayoutEffect(() => {
    if (pendingFocus.current !== null) {
      const { value, source } = pendingFocus.current
      if (!disabled) (buttons.current.get(value) ?? searchInputs.current.get(source))?.focus()
      pendingFocus.current = null
    }
  }, [values, disabled])

  function move(option: Option, adding: boolean) {
    if (disabled) return
    const source = adding ? visibleAvailable : visibleSelected
    const index = source.findIndex((item) => item.value === option.value)
    // Follow visible items only; if the destination hides the moved item, return to the source search.
    pendingFocus.current = {
      value: source[index + 1]?.value ?? source[index - 1]?.value ?? option.value,
      source: adding ? 'available' : 'selected',
    }
    onChange(transferListSelection(values, option.value, adding))
  }

  const pane = (items: Option[], total: number, adding: boolean) => {
    const title = adding ? 'Available' : 'Selected'
    const key = adding ? 'available' : 'selected'
    const headingId = `${id}-${key}`
    const searchId = `${headingId}-search`
    const query = queries[key]
    return <section className="transfer-list-pane" aria-labelledby={headingId}>
      <h4 id={headingId}>{title} ({query.trim() ? `${items.length} of ${total}` : total})</h4>
      <div className="field-group">
        <label htmlFor={searchId}>Search {key}</label>
        <div className="transfer-list-search">
          <input id={searchId} type="search" value={query} disabled={disabled}
            aria-label={`Search ${key} in ${label}`} placeholder="Filter by title"
            ref={(input) => { if (input) searchInputs.current.set(key, input); else searchInputs.current.delete(key) }}
            onChange={(event) => {
              const query = event.currentTarget.value
              setQueries((current) => ({ ...current, [key]: query }))
            }} />
          {query ? <button type="button" className="secondary-button" disabled={disabled}
            aria-label={`Clear ${key} search in ${label}`} onClick={() => {
              setQueries((current) => ({ ...current, [key]: '' }))
              searchInputs.current.get(key)?.focus()
            }}>Clear</button> : null}
        </div>
      </div>
      {items.length ? <ul className="transfer-list-items">{items.map((option) => <li key={option.value}>
        <button type="button" className="secondary-button transfer-list-item" disabled={disabled}
          aria-label={`${adding ? 'Add' : 'Remove'} ${option.label}${showDates ? ` (${dateText(option)})` : ''} ${adding ? 'to' : 'from'} ${label}`}
          ref={(button) => { if (button) buttons.current.set(option.value, button); else buttons.current.delete(option.value) }}
          onClick={() => move(option, adding)}>
          <span className="transfer-list-description"><span>{option.label}</span>
            {showDates ? <small className="transfer-list-date">{option.dateValue && Number.isFinite(Date.parse(option.dateValue))
              ? <time dateTime={option.dateValue}>{dateText(option)}</time> : 'Date unavailable'}</small> : null}
          </span><span className="transfer-list-action" aria-hidden="true">{adding ? 'Add →' : '← Remove'}</span>
        </button>
      </li>)}</ul> : <p className="empty-state">{total ? 'No matching entries' : adding ? 'No available options' : 'None selected'}</p>}
    </section>
  }

  return <fieldset className="toc-section-card transfer-list" disabled={disabled}>
    <legend>{label}</legend>
    <p className="transfer-list-help">Add items from Available to Selected. Remove items to move them back.</p>
    <div className="transfer-list-columns">{pane(visibleAvailable, available.length, true)}{pane(visibleSelected, selected.length, false)}</div>
    <p className="transfer-list-status" role="status">{selected.length} selected</p>
  </fieldset>
}
