/** Presents only supported amendment controls and keeps existing clinical context as read-only heading/value text. */
import { FhirResourceDetails } from '../../components/FhirResourceDetails'
import { ADHERENCE_CODES, ADHERENCE_REASONS, OTHER_ADHERENCE_REASON } from '../../igs/pacioSmp/medicationStatement'
import { getCodeableConceptText } from '../../lib/fhir/formatters'
import type { StatementEditData } from './statementEditData'
import { EDIT_STATUSES, EXISTING_ADHERENCE, EXISTING_ADHERENCE_REASON, initialStatementEdit, statementAdherence, type StatementEdit } from './statementEditModel'

const label = (code: string) => code.replaceAll('-', ' ').replace(/^./, (character) => character.toUpperCase())

export function MedicationStatementEditForm({ data, value, disabled, onChange }: {
  data: StatementEditData; value: StatementEdit; disabled: boolean; onChange: (value: StatementEdit) => void
}) {
  const existingCode = statementAdherence(data.original)?.extension?.find((extension) => extension.url === 'code')?.valueCodeableConcept
  const existingReason = statementAdherence(data.original)?.extension?.find((extension) => extension.url === 'reason')?.valueCodeableConcept
  return <>
    {data.details ? <FhirResourceDetails model={data.details} /> : null}
    <fieldset disabled={disabled} className="device-form-fields">
      <div className="toc-metadata-grid"><div className="field-group"><label htmlFor="statement-edit-status">Status</label>
        <select id="statement-edit-status" value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value })}>
          {!data.original.status ? <option value="">Not recorded</option> : null}
          {data.original.status && !EDIT_STATUSES.includes(data.original.status as typeof EDIT_STATUSES[number]) ? <option value={data.original.status}>Existing: {data.original.status}</option> : null}
          {EDIT_STATUSES.map((code) => <option key={code} value={code}>{label(code)}</option>)}
        </select>
      </div><div className="field-group"><label htmlFor="statement-edit-adherence">Adherence</label>
        <select id="statement-edit-adherence" value={value.adherence} onChange={(event) => onChange({ ...value, adherence: event.target.value,
          adherenceReason: event.target.value ? value.adherenceReason : '', adherenceReasonText: event.target.value ? value.adherenceReasonText : '' })}>
          <option value="">No recorded adherence</option>
          {value.adherence === EXISTING_ADHERENCE ? <option value={EXISTING_ADHERENCE}>Existing: {getCodeableConceptText(existingCode) || 'Unspecified adherence'}</option> : null}
          {ADHERENCE_CODES.map((code) => <option key={code} value={code}>{label(code)}</option>)}
        </select>
      </div></div>
      {value.adherence ? <div className="field-group"><label htmlFor="statement-edit-reason">Adherence reason</label>
        <select id="statement-edit-reason" value={value.adherenceReason} onChange={(event) => onChange({ ...value, adherenceReason: event.target.value })}>
          <option value="">None selected</option>
          {initialStatementEdit(data.original).adherenceReason === EXISTING_ADHERENCE_REASON ? <option value={EXISTING_ADHERENCE_REASON}>Existing: {getCodeableConceptText(existingReason) || 'Unspecified reason'}</option> : null}
          {ADHERENCE_REASONS.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}
          <option value={OTHER_ADHERENCE_REASON}>Other</option>
        </select>
      </div> : null}
      {value.adherence && value.adherenceReason === OTHER_ADHERENCE_REASON ? <div className="field-group"><label htmlFor="statement-edit-reason-text">Other adherence reason</label>
        <input id="statement-edit-reason-text" value={value.adherenceReasonText} onChange={(event) => onChange({ ...value, adherenceReasonText: event.target.value })} />
      </div> : null}
      <div className="field-group"><label htmlFor="statement-edit-note">New note</label>
        <textarea id="statement-edit-note" rows={4} value={value.newNote} onChange={(event) => onChange({ ...value, newNote: event.target.value })} />
      </div>
    </fieldset>
  </>
}
