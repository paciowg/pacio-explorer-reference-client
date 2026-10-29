/** Models a limited statement amendment while preserving all original content outside explicitly edited fields. */
import type { CodeableConcept, Extension, MedicationStatement } from 'fhir/r4'
import { ADHERENCE_CODES, adherenceReasonCode, adherenceReasonConcept, OTHER_ADHERENCE_REASON, SMP_ADHERENCE, STATEMENT_STATUSES } from '../../igs/pacioSmp/medicationStatement'

export const EDIT_STATUSES = [...STATEMENT_STATUSES, 'entered-in-error'] as const
const ADHERENCE_SYSTEM = 'http://hl7.org/fhir/CodeSystem/medication-statement-adherence'
export const EXISTING_ADHERENCE = '__existing__'
export const EXISTING_ADHERENCE_REASON = '__existing_reason__'
export type StatementEdit = { status: string; adherence: string; adherenceReason: string; adherenceReasonText: string; newNote: string }

export function statementAdherence(statement: MedicationStatement) {
  return statement.extension?.find((extension) => extension.url === SMP_ADHERENCE)
}

export function initialStatementEdit(statement: MedicationStatement): StatementEdit {
  const extension = statementAdherence(statement)
  const concept = extension?.extension?.find((child) => child.url === 'code')?.valueCodeableConcept
  const code = concept?.coding?.find((coding) => coding.system === ADHERENCE_SYSTEM && ADHERENCE_CODES.includes(coding.code as typeof ADHERENCE_CODES[number]))?.code
  const reason = extension?.extension?.find((child) => child.url === 'reason')?.valueCodeableConcept
  return { status: statement.status || '', adherence: code || (extension ? EXISTING_ADHERENCE : ''),
    adherenceReason: adherenceReasonCode(reason) || (reason?.coding?.length ? EXISTING_ADHERENCE_REASON : reason ? OTHER_ADHERENCE_REASON : ''),
    adherenceReasonText: reason?.coding?.length ? '' : reason?.text || '', newNote: '' }
}

export function hasStatementEdits(original: MedicationStatement, edit: StatementEdit) {
  const initial = initialStatementEdit(original)
  return edit.status !== initial.status || edit.adherence !== initial.adherence ||
    reasonHasChanged(initial, edit) || Boolean(edit.newNote.trim())
}

function reasonHasChanged(initial: StatementEdit, edit: StatementEdit) {
  return edit.adherenceReason !== initial.adherenceReason || (edit.adherenceReason === OTHER_ADHERENCE_REASON && edit.adherenceReasonText.trim() !== initial.adherenceReasonText.trim())
}

function setAdherenceValue(extension: Extension, url: string, value: CodeableConcept | undefined) {
  const children = extension.extension || []
  const index = children.findIndex((child) => child.url === url)
  if (!value) extension.extension = children.filter((child) => child.url !== url)
  else if (index === -1) extension.extension = [...children, { url, valueCodeableConcept: value }]
  else children[index] = { ...children[index], valueCodeableConcept: value }
}

export function buildStatementUpdate(original: MedicationStatement, edit: StatementEdit, timestamp: string): MedicationStatement {
  const initial = initialStatementEdit(original)
  const updated = structuredClone(original)
  if (edit.status !== initial.status) {
    if (!EDIT_STATUSES.includes(edit.status as typeof EDIT_STATUSES[number])) throw new Error('Select a supported medication-use status.')
    updated.status = edit.status as MedicationStatement['status']
  }
  const codeChanged = edit.adherence !== initial.adherence
  const reasonChanged = reasonHasChanged(initial, edit)
  if (codeChanged || reasonChanged) {
    if (!edit.adherence) {
      const kept = updated.extension?.filter((extension) => extension.url !== SMP_ADHERENCE)
      if (kept?.length) updated.extension = kept
      else delete updated.extension
    } else {
      let extension = statementAdherence(updated)
      if (!extension) {
        extension = { url: SMP_ADHERENCE, extension: [] }
        updated.extension = [...(updated.extension || []), extension]
      }
      if (codeChanged) {
        if (!ADHERENCE_CODES.includes(edit.adherence as typeof ADHERENCE_CODES[number])) throw new Error('Select a supported adherence value.')
        setAdherenceValue(extension, 'code', { coding: [{ system: ADHERENCE_SYSTEM, code: edit.adherence, display: edit.adherence.replaceAll('-', ' ') }] })
      }
      if (reasonChanged) setAdherenceValue(extension, 'reason', adherenceReasonConcept(edit.adherenceReason, edit.adherenceReasonText))
    }
  }
  const text = edit.newNote.trim()
  if (text) updated.note = [...(updated.note || []), { text, time: timestamp }]
  return updated
}
