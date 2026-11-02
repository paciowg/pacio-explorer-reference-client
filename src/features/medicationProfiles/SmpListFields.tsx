/** Shares medication List metadata controls between creation and editing, preserving original values until explicitly changed. */
import type { List } from 'fhir/r4'
import { EMPTY_REASONS, MEDICATION_LIST_TYPE_CHOICES } from '../../igs/pacioSmp/smp'
import { formatDate, getCodeableConceptText } from '../../lib/fhir/formatters'
import { formatResourceSelectionLabel } from '../../lib/fhir/resourceOptions'
import type { SmpChoices } from './smpData'
import { EXISTING_LIST_VALUE, initialSmpListEdit } from './smpListEditModel'

type Metadata = { typeCode: string; date: string; author: string; notes: string }

export function SmpListFields({ value, authors, onChange, original }: {
  value: Metadata; authors: SmpChoices['authors']; onChange: (patch: Partial<Metadata>) => void; original?: List
}) {
  const existingDate = Boolean(original?.date && !/^\d{4}-\d{2}-\d{2}$/.test(original.date))
  const source = original?.source
  const sourceType = source?.type?.split('/').pop() || source?.reference?.match(/(?:^|\/)(PractitionerRole|Practitioner)\//)?.[1] || original?.contained?.find((resource) => `#${resource.id}` === source?.reference)?.resourceType
  const sourceName = source?.display || source?.reference?.replace(/\/_history\/[^/]+$/, '').split('/').pop() || source?.identifier?.value || 'Unavailable'
  const sourceLabel = sourceType ? formatResourceSelectionLabel(sourceType, sourceName) : sourceName
  return <>
    <p>Mode: {original ? original.mode || 'Unavailable' : 'snapshot'} · Status: {original ? original.status || 'Unavailable' : 'current'}</p>
    <div className="field-group"><label htmlFor="smp-type">List type</label><select id="smp-type" value={value.typeCode} required onChange={(event) => onChange({ typeCode: event.target.value })}>
      <option value="">Select a type</option>
      {original && initialSmpListEdit(original).typeCode === EXISTING_LIST_VALUE ? <option value={EXISTING_LIST_VALUE}>Existing: {getCodeableConceptText(original.code) || 'Unspecified type'}</option> : null}
      {MEDICATION_LIST_TYPE_CHOICES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
    </select></div>
    <div className="field-group"><label htmlFor="smp-date">{existingDate ? 'Replace list date (optional)' : 'List date'}</label>
      {existingDate ? <p>Existing: {formatDate(original?.date)}</p> : null}
      <input id="smp-date" type="date" required={!existingDate} value={existingDate && value.date === original?.date ? '' : value.date}
        onChange={(event) => onChange({ date: event.target.value || (existingDate ? original!.date! : '') })} />
    </div>
    <div className="field-group"><label htmlFor="smp-author">Author / source</label><select id="smp-author" required value={value.author} onChange={(event) => onChange({ author: event.target.value })}>
      <option value="">Select an author</option>
      {source && !authors.some((option) => option.reference === (source.reference || EXISTING_LIST_VALUE)) ? <option value={source.reference || EXISTING_LIST_VALUE}>Existing: {sourceLabel}</option> : null}
      {authors.map((option) => <option key={option.reference} value={option.reference}>{option.label}</option>)}
    </select></div>
    {original?.note?.length ? <div className="field-group"><span>Existing notes</span>{original.note.map((note, index) => <p key={index}>{note.text}
      {[note.authorString || note.authorReference?.display || note.authorReference?.reference, note.time ? formatDate(note.time) : ''].filter(Boolean).map((detail, i) => <span key={i}> · {detail}</span>)}
    </p>)}</div> : null}
    <div className="field-group"><label htmlFor="smp-notes">{original ? 'New note' : 'Notes'}</label><textarea id="smp-notes" value={value.notes} onChange={(event) => onChange({ notes: event.target.value })} /></div>
  </>
}

export function SmpListEmptyReason({ value, onChange, original }: { value: string; onChange: (value: string) => void; original?: List }) {
  return <div className="field-group"><label htmlFor="smp-empty">Reason for an empty List</label><select id="smp-empty" required value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">Select an explicit reason</option>
    {original && initialSmpListEdit(original).emptyReason === EXISTING_LIST_VALUE ? <option value={EXISTING_LIST_VALUE}>Existing: {getCodeableConceptText(original.emptyReason) || 'Unspecified reason'}</option> : null}
    {EMPTY_REASONS.map(([code, label]) => <option value={code} key={code}>{label}</option>)}
  </select></div>
}
