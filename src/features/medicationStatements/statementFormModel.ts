/** Owns controlled statement inputs and lossless request population, converting only explicitly entered fields into FHIR. */
import type { Dosage, MedicationStatement } from 'fhir/r4'
import { calendarDateValue, localDateInputValue } from '../../lib/dateTime'
import { ADHERENCE_CODES, adherenceReasonConcept, buildSmpMedicationStatement, OTHER_ADHERENCE_REASON, STATEMENT_STATUSES, type SmpStatementInput } from '../../igs/pacioSmp/medicationStatement'
import { issueCollector } from '../../lib/formValidation'
import { resolveOptionReference } from '../../lib/fhir/resourceOptions'
import { REASON_TYPES, SOURCE_TYPES, type StatementCreateData, type StatementMedication } from './statementCreateData'

export type StatementForm = {
  basedOn: string; medication: StatementMedication; dosage: Dosage[]; status: MedicationStatement['status'] | ''
  effectiveKind: '' | 'date' | 'period'; effectiveStart: string; effectiveEnd: string; dateAsserted: string
  informationSource: string; adherence: string; adherenceReason: string; adherenceReasonText: string; context: string; category: string
  statusReason: string; reasonReferences: string[]; notes: string
}
export function initialStatementForm(): StatementForm {
  return { basedOn: '', medication: {}, dosage: [], status: '', effectiveKind: '', effectiveStart: '', effectiveEnd: '',
    dateAsserted: localDateInputValue(), informationSource: '', adherence: '', adherenceReason: '', adherenceReasonText: '', context: '', category: '',
    statusReason: '', reasonReferences: [], notes: '' }
}

export function selectStatementRequest(form: StatementForm, reference: string, data: StatementCreateData): StatementForm {
  if (!reference) return { ...form, basedOn: '' }
  const choice = data.requests.find((request) => request.reference === reference)
  if (!choice) throw new Error('The selected MedicationRequest is unavailable.')
  return { ...form, basedOn: reference, medication: structuredClone(choice.medication), dosage: structuredClone(choice.resource.dosageInstruction || []) }
}

function dosageIssues(dosages: Dosage[]) {
  const v = issueCollector()
  dosages.forEach((dose, index) => {
    const key = `dosages.${index}.`
    const repeat = dose.timing?.repeat
    for (const [label, field, value] of [['Dose', 'Dose amount', dose.doseAndRate?.[0]?.doseQuantity?.value], ['Frequency', 'Times per period', repeat?.frequency], ['Period', 'Period length', repeat?.period]] as const) {
      v.require(`${key}${field}`, value === undefined || (Number.isFinite(value) && value > 0), `${label} must be a positive number.`)
    }
    v.require(`${key}Times per period`, repeat?.frequency === undefined || Number.isInteger(repeat.frequency), 'Frequency must be a whole number.')
    if (repeat?.frequency !== undefined || repeat?.period !== undefined) {
      for (const [field, value] of [['Times per period', repeat.frequency], ['Period length', repeat.period], ['Period unit', repeat.periodUnit]]) {
        v.require(`${key}${field}`, value, 'Complete the frequency, period, and period unit.')
      }
    }
    const amount = dose.doseAndRate?.[0]?.doseQuantity
    if (amount && (amount.value !== undefined || amount.code || amount.unit)) {
      v.require(`${key}Dose amount`, amount.value !== undefined, 'Provide both a dose amount and its unit.')
      v.require(`${key}Dose unit`, amount.code || amount.unit, 'Provide both a dose amount and its unit.')
    }
    v.require(`${key}Clock times (comma separated, HH:MM)`, !repeat?.timeOfDay?.some((time) => !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(time)), 'Enter clock times as HH:MM or HH:MM:SS.')
    if (repeat?.boundsPeriod) {
      const { start, end } = repeat.boundsPeriod
      v.require(`${key}Dosage start date`, !start || Number.isFinite(Date.parse(start)), 'Enter a valid dosage start date.')
      v.require(`${key}Dosage end date`, !end || Number.isFinite(Date.parse(end)), 'Enter a valid dosage end date.')
      v.require(`${key}Dosage end date`, !start || !end || !(Date.parse(end) < Date.parse(start)), 'Dosage end must not precede its start.')
    }
  })
  return v.issues
}

function validateDosages(dosages: Dosage[]) {
  const issues = dosageIssues(dosages)
  if (issues.length) throw new Error(issues[0].message)
  for (const dose of dosages) {
    const repeat = dose.timing?.repeat
    if (repeat?.timeOfDay) repeat.timeOfDay = repeat.timeOfDay.map((time) => time.length === 5 ? `${time}:00` : time)
  }
}

export function validateStatementForm(form: StatementForm, data: StatementCreateData) {
  const v = issueCollector()
  v.require('Based on MedicationRequest (optional)', !form.basedOn || data.requests.some((request) => request.reference === form.basedOn), 'The selected MedicationRequest is unavailable.')
  v.require('Status', STATEMENT_STATUSES.includes(form.status as typeof STATEMENT_STATUSES[number]), 'Select a medication-use status.')
  if (!form.basedOn) {
    v.require('Medication', Number(Boolean(form.medication.medicationCodeableConcept)) + Number(Boolean(form.medication.medicationReference)) === 1, 'Select exactly one medication.')
    if (form.medication.medicationCodeableConcept) v.require('Medication', form.medication.medicationCodeableConcept.coding?.some((coding) => coding.system && coding.code), 'A coded medication is required.')
    if (form.medication.medicationReference) v.check('Medication', () => resolveOptionReference(data.options, form.medication.medicationReference!.reference || '', ['Medication']))
    v.issues.push(...dosageIssues(form.dosage))
  }
  if (form.dateAsserted) v.check('Date asserted', () => calendarDateValue(form.dateAsserted, 'asserted date'))
  if (form.effectiveKind === 'date') v.check('Effective date', () => calendarDateValue(form.effectiveStart, 'effective date'))
  if (form.effectiveKind === 'period') {
    v.require('Effective start date', form.effectiveStart || form.effectiveEnd, 'Enter at least one effective date range boundary.')
    if (form.effectiveStart) v.check('Effective start date', () => calendarDateValue(form.effectiveStart, 'effective start date'))
    if (form.effectiveEnd) v.check('Effective end date', () => calendarDateValue(form.effectiveEnd, 'effective end date'))
    v.require('Effective end date', !form.effectiveStart || !form.effectiveEnd || form.effectiveEnd >= form.effectiveStart, 'Effective end must not precede its start.')
  }
  v.require('Adherence', !form.adherence || ADHERENCE_CODES.includes(form.adherence as typeof ADHERENCE_CODES[number]), 'Select a supported adherence value.')
  v.require('Adherence', form.adherence || !form.adherenceReason.trim(), 'Select adherence before providing an adherence reason.')
  v.check(form.adherenceReason === OTHER_ADHERENCE_REASON ? 'Other adherence reason' : 'Adherence reason', () => adherenceReasonConcept(form.adherenceReason, form.adherenceReasonText))
  for (const [field, value, types] of [['Information source', form.informationSource, SOURCE_TYPES], ['Encounter', form.context, ['Encounter']]] as const) {
    v.check(field, () => resolveOptionReference(data.options, value, types))
  }
  form.reasonReferences.forEach((reference) => v.check('Reason references', () => resolveOptionReference(data.options, reference, REASON_TYPES)))
  return v.issues
}

function populated(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(populated).filter((item) => item !== undefined)
    return items.length ? items : undefined
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, child]) => [key, populated(child)]).filter(([, child]) => child !== undefined)
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  return value === '' ? undefined : value
}

export function statementFormInputs(form: StatementForm, data: StatementCreateData): Omit<SmpStatementInput, 'subject'> {
  const request = form.basedOn ? data.requests.find((choice) => choice.reference === form.basedOn) : undefined
  if (form.basedOn && !request) throw new Error('The selected MedicationRequest is unavailable.')
  // A selected request remains authoritative even if form state is changed outside the disabled controls.
  const medication = request ? structuredClone(request.medication) : structuredClone(form.medication)
  const dosage = request ? structuredClone(request.resource.dosageInstruction || []) : (populated(structuredClone(form.dosage)) as Dosage[] | undefined) || []
  if (!request) validateDosages(dosage)
  if (!request && medication.medicationReference) medication.medicationReference = resolveOptionReference(data.options, medication.medicationReference.reference || '', ['Medication'])
  const date = (value: string, label: string) => value ? calendarDateValue(value, label) : undefined
  let effective: Pick<SmpStatementInput, 'effectiveDateTime' | 'effectivePeriod'> = {}
  if (form.effectiveKind === 'date') effective = { effectiveDateTime: calendarDateValue(form.effectiveStart, 'effective date') }
  if (form.effectiveKind === 'period') {
    const start = date(form.effectiveStart, 'effective start date'), end = date(form.effectiveEnd, 'effective end date')
    if (!start && !end) throw new Error('Enter at least one effective date range boundary.')
    if (start && end && end < start) throw new Error('Effective end must not precede its start.')
    effective = { effectivePeriod: { ...(start ? { start } : {}), ...(end ? { end } : {}) } }
  }
  const input: SmpStatementInput = {
    subject: { reference: 'Patient/pending' }, status: form.status as MedicationStatement['status'], ...medication, ...effective,
    ...(request ? { basedOn: [{ reference: request.reference, display: request.display }] } : {}),
    ...(dosage.length ? { dosage } : {}),
    ...(form.dateAsserted ? { dateAsserted: date(form.dateAsserted, 'asserted date') } : {}),
    ...(form.informationSource ? { informationSource: resolveOptionReference(data.options, form.informationSource, SOURCE_TYPES) } : {}),
    ...(form.context ? { context: resolveOptionReference(data.options, form.context, ['Encounter']) } : {}),
    ...(form.category ? { category: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medication-statement-category', code: form.category }] } } : {}),
    ...(form.statusReason.trim() ? { statusReason: [{ text: form.statusReason.trim() }] } : {}),
    ...(form.reasonReferences.length ? { reasonReference: form.reasonReferences.map((value) => resolveOptionReference(data.options, value, REASON_TYPES)!) } : {}),
    ...(form.notes.trim() ? { note: [{ text: form.notes.trim() }] } : {}),
    adherence: form.adherence || undefined, adherenceReason: form.adherenceReason || undefined, adherenceReasonText: form.adherenceReasonText || undefined,
  }
  buildSmpMedicationStatement(input)
  const { subject: _subject, ...fields } = input
  return fields
}
