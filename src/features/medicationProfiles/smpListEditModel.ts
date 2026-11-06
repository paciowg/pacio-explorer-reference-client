/** Applies explicit List edits to the original resource, preserving unsupported content and metadata on retained entries. */
import type { CodeableConcept, List, MedicationStatement } from 'fhir/r4'
import { EMPTY_REASONS, MEDICATION_LIST_TYPE_CHOICES } from '../../igs/pacioSmp/smp'
import { calendarDateValue } from '../../lib/dateTime'
import type { SmpChoices } from './smpData'
import { samePatient, sourceReference } from './smpReferences'
import { issueCollector } from '../../lib/formValidation'

export const EXISTING_LIST_VALUE = '__existing__'
const EMPTY_REASON_SYSTEM = 'http://terminology.hl7.org/CodeSystem/list-empty-reason'
export type SmpListEdit = { title: string; typeCode: string; date: string; author: string; notes: string; selected: string[]; emptyReason: string }
export const existingEntryValue = (index: number) => `existing-entry:${index}`

function conceptChoice(concept: CodeableConcept | undefined, system: string, choices: readonly (readonly [string, string])[]) {
  if (!concept) return ''
  return concept.coding?.find((coding) => coding.system === system && choices.some(([code]) => code === coding.code))?.code || EXISTING_LIST_VALUE
}

export function initialSmpListEdit(original: List): SmpListEdit {
  return { title: original.title || '', typeCode: conceptChoice(original.code, 'http://loinc.org', MEDICATION_LIST_TYPE_CHOICES),
    date: original.date || '', author: original.source?.reference || (original.source ? EXISTING_LIST_VALUE : ''), notes: '',
    selected: (original.entry || []).map((_, index) => existingEntryValue(index)),
    emptyReason: conceptChoice(original.emptyReason, EMPTY_REASON_SYSTEM, EMPTY_REASONS) }
}

export function hasSmpListEdits(original: List, edit: SmpListEdit) {
  const initial = initialSmpListEdit(original)
  return edit.title !== initial.title || edit.typeCode !== initial.typeCode || edit.date !== initial.date || edit.author !== initial.author ||
    edit.emptyReason !== initial.emptyReason || Boolean(edit.notes.trim()) ||
    edit.selected.length !== initial.selected.length || edit.selected.some((value) => !initial.selected.includes(value))
}

export function validateSmpListEdit(original: List, edit: SmpListEdit, choices: SmpChoices, baseUrl: string, patientId: string) {
  const initial = initialSmpListEdit(original)
  const v = issueCollector()
  for (const [field, key] of [['smp-title', 'title'], ['smp-type', 'typeCode'], ['smp-date', 'date'], ['smp-author', 'author']] as const) {
    v.check(field, () => buildSmpListUpdate(original, { ...initial, [key]: edit[key] }, choices, baseUrl, patientId, ''))
  }
  v.check(edit.selected.length ? 'Medication statements' : 'smp-empty', () => buildSmpListUpdate(original, { ...initial, selected: edit.selected, emptyReason: edit.emptyReason }, choices, baseUrl, patientId, ''))
  return v.issues
}

// Keep historical references distinct, but recognize relative and same-server absolute aliases.
export function listReferenceKey(baseUrl: string, reference: string | undefined) {
  if (!reference) return undefined
  try { return sourceReference(baseUrl, reference) } catch { return reference }
}

export function buildSmpListUpdate(original: List, edit: SmpListEdit, choices: SmpChoices, baseUrl: string, patientId: string, timestamp: string): List {
  if (choices.patient.id !== patientId || !samePatient(baseUrl, patientId, original.subject?.reference)) throw new Error('This medication List does not belong to the current patient.')
  const initial = initialSmpListEdit(original)
  const updated = structuredClone(original)
  if (edit.title !== initial.title) {
    if (!edit.title.trim()) throw new Error('Enter a List title.')
    updated.title = edit.title.trim()
  }
  if (edit.typeCode !== initial.typeCode) {
    const type = MEDICATION_LIST_TYPE_CHOICES.find(([code]) => code === edit.typeCode)
    if (!type) throw new Error('Select a medication list type.')
    updated.code = { coding: [{ system: 'http://loinc.org', version: '2.80', code: type[0], display: type[1] }] }
  }
  if (edit.date !== initial.date) updated.date = calendarDateValue(edit.date, 'List date')
  if (edit.author !== initial.author) {
    const author = choices.authors.find((option) => option.reference === edit.author)
    if (!author) throw new Error('Select the List author.')
    updated.source = { reference: author.reference, display: author.display }
  }
  const membershipChanged = edit.selected.length !== initial.selected.length || edit.selected.some((value) => !initial.selected.includes(value))
  if (membershipChanged) {
    const selected = new Set(edit.selected)
    if (selected.size !== edit.selected.length) throw new Error('Duplicate statement selections.')
    const entries = (updated.entry || []).filter((_, index) => selected.has(existingEntryValue(index)))
    const retainedKeys = new Set(entries.map((entry) => listReferenceKey(baseUrl, entry.item.reference)).filter(Boolean))
    for (const value of edit.selected) {
      if (initial.selected.includes(value)) continue
      const option = choices.options.find((item) => item.reference === value)
      if (!option || option.resource.resourceType !== 'MedicationStatement' || !samePatient(baseUrl, patientId, (option.resource as MedicationStatement).subject?.reference)) throw new Error('Select available MedicationStatements for the current patient.')
      const key = listReferenceKey(baseUrl, option.reference)!
      if (retainedKeys.has(key)) throw new Error('Duplicate statement references.')
      retainedKeys.add(key)
      entries.push({ item: { reference: option.reference, display: option.display } })
    }
    if (entries.length) updated.entry = entries
    else delete updated.entry
  }
  if (updated.entry?.length) {
    if (membershipChanged || edit.emptyReason !== initial.emptyReason) delete updated.emptyReason
  } else if (membershipChanged || edit.emptyReason !== initial.emptyReason) {
    if (edit.emptyReason === EXISTING_LIST_VALUE && original.emptyReason) updated.emptyReason = structuredClone(original.emptyReason)
    else {
      const reason = EMPTY_REASONS.find(([code]) => code === edit.emptyReason)
      if (!reason) throw new Error('An empty List requires an explicit reason.')
      updated.emptyReason = { coding: [{ system: EMPTY_REASON_SYSTEM, code: reason[0], display: reason[1] }] }
    }
  }
  if (edit.notes.trim()) updated.note = [...(updated.note || []), { text: edit.notes.trim(), time: timestamp }]
  return updated
}
