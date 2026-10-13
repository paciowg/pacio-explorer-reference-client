/** Presents controlled multi-selection as available and selected lists without owning option loading or validation. */
import { useId, useLayoutEffect, useRef } from 'react'
import { transferListSelection } from './transferListModel'

type Option = { value: string; label: string }
type Props = { label: string; options: Option[]; values: string[]; disabled?: boolean; onChange: (values: string[]) => void }

export function TransferList({ label, options, values, disabled = false, onChange }: Props) {
  const id = useId()
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocus = useRef<string | null>(null)
  const selectedValues = new Set(values)
  const optionsByValue = new Map(options.map((option) => [option.value, option]))
  const available = options.filter((option) => !selectedValues.has(option.value))
  // Keep stale selections visible and removable; callers still own reference validation.
  const selected = [...selectedValues].map((value) => optionsByValue.get(value) || { value, label: `${value} (Unavailable)` })

  useLayoutEffect(() => {
    if (pendingFocus.current !== null) {
      if (!disabled) buttons.current.get(pendingFocus.current)?.focus()
      pendingFocus.current = null
    }
  }, [values, disabled])

  function move(option: Option, adding: boolean) {
    if (disabled) return
    const source = adding ? available : selected
    const index = source.findIndex((item) => item.value === option.value)
    // Prefer another item in the source list; if it becomes empty, focus the moved item.
    pendingFocus.current = source[index + 1]?.value ?? source[index - 1]?.value ?? option.value
    onChange(transferListSelection(values, option.value, adding))
  }

  const pane = (items: Option[], adding: boolean) => {
    const title = adding ? 'Available' : 'Selected'
    const headingId = `${id}-${adding ? 'available' : 'selected'}`
    return <section className="transfer-list-pane" aria-labelledby={headingId}>
      <h4 id={headingId}>{title} ({items.length})</h4>
      {items.length ? <ul className="transfer-list-items">{items.map((option) => <li key={option.value}>
        <button type="button" className="secondary-button transfer-list-item" disabled={disabled}
          aria-label={`${adding ? 'Add' : 'Remove'} ${option.label} ${adding ? 'to' : 'from'} ${label}`}
          ref={(button) => { if (button) buttons.current.set(option.value, button); else buttons.current.delete(option.value) }}
          onClick={() => move(option, adding)}>
          <span>{option.label}</span><span className="transfer-list-action" aria-hidden="true">{adding ? 'Add →' : '← Remove'}</span>
        </button>
      </li>)}</ul> : <p className="empty-state">{adding ? 'No available options' : 'None selected'}</p>}
    </section>
  }

  return <fieldset className="toc-section-card transfer-list" disabled={disabled}>
    <legend>{label}</legend>
    <p className="transfer-list-help">Add items from Available to Selected. Remove items to move them back.</p>
    <div className="transfer-list-columns">{pane(available, true)}{pane(selected, false)}</div>
    <p className="transfer-list-status" role="status">{selected.length} selected</p>
  </fieldset>
}
