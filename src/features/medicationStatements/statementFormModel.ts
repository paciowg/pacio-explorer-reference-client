/** Owns controlled statement inputs and lossless request population, converting only explicitly entered fields into FHIR. */
import type { Dosage, MedicationStatement, Reference } from 'fhir/r4'
import { calendarDateValue, localDateInputValue } from '../../lib/dateTime'
import { buildSmpMedicationStatement, type SmpStatementInput } from '../../igs/pacioSmp/medicationStatement'
import type { ResourceReferenceOption } from '../../lib/fhir/resourceOptions'
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

export function statementReference(options: ResourceReferenceOption[], value: string, types: string[]): Reference | undefined {
  if (!value) return undefined
  const option = options.find((item) => item.reference === value && types.includes(item.resource.resourceType))
  if (!option) throw new Error('A selected reference is no longer available on the destination.')
  return { reference: option.reference, display: option.display }
}

function validateDosages(dosages: Dosage[]) {
  for (const dose of dosages) {
    const repeat = dose.timing?.repeat
    for (const [label, value] of [['Dose', dose.doseAndRate?.[0]?.doseQuantity?.value], ['Frequency', repeat?.frequency], ['Period', repeat?.period]] as const) {
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error(`${label} must be a positive number.`)
    }
    if (repeat?.frequency !== undefined && !Number.isInteger(repeat.frequency)) throw new Error('Frequency must be a whole number.')
    if ((repeat?.frequency !== undefined || repeat?.period !== undefined) && (!repeat.frequency || !repeat.period || !repeat.periodUnit)) throw new Error('Complete the frequency, period, and period unit.')
    const amount = dose.doseAndRate?.[0]?.doseQuantity
    if (amount && (amount.value === undefined || (!amount.code && !amount.unit))) throw new Error('Provide both a dose amount and its unit.')
    if (repeat?.timeOfDay) repeat.timeOfDay = repeat.timeOfDay.map((time) => {
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(time)) throw new Error('Enter clock times as HH:MM or HH:MM:SS.')
      return time.length === 5 ? `${time}:00` : time
    })
    if (repeat?.boundsPeriod) {
      const { start, end } = repeat.boundsPeriod
      if (start && !Number.isFinite(Date.parse(start))) throw new Error('Enter a valid dosage start date.')
      if (end && !Number.isFinite(Date.parse(end))) throw new Error('Enter a valid dosage end date.')
      if (start && end && Date.parse(end) < Date.parse(start)) throw new Error('Dosage end must not precede its start.')
    }
  }
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
  if (!request && medication.medicationReference) medication.medicationReference = statementReference(data.options, medication.medicationReference.reference || '', ['Medication'])
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
    ...(form.informationSource ? { informationSource: statementReference(data.options, form.informationSource, SOURCE_TYPES) } : {}),
    ...(form.context ? { context: statementReference(data.options, form.context, ['Encounter']) } : {}),
    ...(form.category ? { category: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medication-statement-category', code: form.category }] } } : {}),
    ...(form.statusReason.trim() ? { statusReason: [{ text: form.statusReason.trim() }] } : {}),
    ...(form.reasonReferences.length ? { reasonReference: form.reasonReferences.map((value) => statementReference(data.options, value, REASON_TYPES)!) } : {}),
    ...(form.notes.trim() ? { note: [{ text: form.notes.trim() }] } : {}),
    adherence: form.adherence || undefined, adherenceReason: form.adherenceReason || undefined, adherenceReasonText: form.adherenceReasonText || undefined,
  }
  buildSmpMedicationStatement(input)
  const { subject: _subject, ...fields } = input
  return fields
}
