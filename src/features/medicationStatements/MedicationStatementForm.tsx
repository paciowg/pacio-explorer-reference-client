/** Presents statement authoring with an optional authoritative request, lossless dosage review, and destination-local selections. */
import type { Dosage, TimingRepeat } from 'fhir/r4'
import { TransferList } from '../../components/TransferList'
import { ADHERENCE_CODES, catalogMedication, MEDICATION_CATALOG, MEDICATION_ROUTES, STATEMENT_STATUSES } from '../../igs/pacioSmp/medicationStatement'
import { formatDate, getCodeableConceptText } from '../../lib/fhir/formatters'
import { getResourceReferenceChoices, getResourceTransferChoices } from '../../lib/fhir/resourceOptions'
import { REASON_TYPES, SOURCE_TYPES, type StatementCreateData } from './statementCreateData'
import { selectStatementRequest, type StatementForm } from './statementFormModel'

const words = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('-', ' ').replace(/^./, (letter) => letter.toUpperCase())
const choices = (values: readonly string[]) => values.map((value) => ({ value, label: words(value) }))
const DOSE_UNITS = [['mg', 'mg'], ['g', 'g'], ['mL', 'mL'], ['[iU]', 'international units'], ['{tbl}', 'tablets'], ['{capsule}', 'capsules'], ['{puff}', 'puffs']]

function Select({ label, value, options, onChange, required = false }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; required?: boolean }) {
  return <div className="field-group"><label>{label}<select value={value} required={required} onChange={(event) => onChange(event.target.value)}><option value="">{required ? 'Select a value' : 'None selected'}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
}
function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="field-group"><label>{label}<input type={type} step={type === 'number' ? 'any' : undefined} value={value} onChange={(event) => onChange(event.target.value)} /></label></div>
}

// Imported dosage can contain fields beyond the editor's subset; show every field without changing the copied structure.
function describeValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(describeValue).join('; ')
  if (typeof value === 'object') return Object.entries(value).map(([key, child]) => `${words(key)}: ${describeValue(child)}`).join(' · ')
  if (typeof value === 'string' && /^\d{4}(?:-\d{2}){0,2}(?:T.*)?$/.test(value)) return formatDate(value)
  return String(value)
}
function DosageReview({ values }: { values: Dosage[] }) {
  return values.length ? values.map((dose, index) => <div key={index}><h4>Dosage {index + 1}</h4><dl className="fhir-detail-grid">
    {Object.entries(dose).map(([key, value]) => <div key={key} className="fhir-detail-field-multiline"><dt>{words(key)}</dt><dd>{describeValue(value)}</dd></div>)}
  </dl></div>) : <p className="empty-state">No dosage instructions recorded on the selected request.</p>
}

function DosageEditor({ values, onChange }: { values: Dosage[]; onChange: (values: Dosage[]) => void }) {
  return <>{values.map((dose, index) => {
    const set = (patch: Partial<Dosage>) => onChange(values.map((old, position) => position === index ? { ...old, ...patch } : old))
    const repeat = dose.timing?.repeat || {}
    const schedule = (patch: Partial<TimingRepeat>) => set({ timing: { ...dose.timing, repeat: { ...repeat, ...patch } } })
    const quantity = dose.doseAndRate?.[0]?.doseQuantity
    const amount = (value: string) => {
      const first = { ...dose.doseAndRate?.[0], doseRange: undefined, doseQuantity: { ...quantity, value: value === '' ? undefined : Number(value) } }
      set({ doseAndRate: [first, ...(dose.doseAndRate?.slice(1) || [])] })
    }
    return <fieldset key={index} className="toc-section-card"><legend>Dosage {index + 1}</legend><div className="toc-metadata-grid">
      <Input label="Dosage instructions" value={dose.text || ''} onChange={(text) => set({ text: text || undefined })} />
      <Input label="Dose amount" type="number" value={quantity?.value?.toString() || ''} onChange={amount} />
      <Select label="Dose unit" value={quantity?.code || ''} options={DOSE_UNITS.map(([value, label]) => ({ value, label }))} onChange={(code) => {
        set({ doseAndRate: [{ ...dose.doseAndRate?.[0], doseRange: undefined, doseQuantity: { ...quantity,
          system: code ? 'http://unitsofmeasure.org' : undefined, code: code || undefined, unit: DOSE_UNITS.find(([value]) => value === code)?.[1] } }, ...(dose.doseAndRate?.slice(1) || [])] })
      }} />
      <Select label="Route" value={dose.route?.coding?.[0]?.code || ''} options={MEDICATION_ROUTES.map(([value, label]) => ({ value, label }))} onChange={(code) => set({ route: code ? { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration', code, display: MEDICATION_ROUTES.find(([value]) => value === code)?.[1] }] } : undefined })} />
      <Input label="Times per period" type="number" value={repeat.frequency?.toString() || ''} onChange={(value) => schedule({ frequency: value === '' ? undefined : Number(value) })} />
      <Input label="Period length" type="number" value={repeat.period?.toString() || ''} onChange={(value) => schedule({ period: value === '' ? undefined : Number(value) })} />
      <Select label="Period unit" value={repeat.periodUnit || ''} options={[{ value: 'h', label: 'Hours' }, { value: 'd', label: 'Days' }, { value: 'wk', label: 'Weeks' }, { value: 'mo', label: 'Months' }]} onChange={(periodUnit) => schedule({ periodUnit: periodUnit as TimingRepeat['periodUnit'] || undefined })} />
      <Input label="Clock times (comma separated, HH:MM)" value={repeat.timeOfDay?.join(', ') || ''} onChange={(value) => schedule({ timeOfDay: value.trim() ? value.split(',').map((part) => part.trim()) : undefined })} />
      <Input label="Dosage start date" type="date" value={repeat.boundsPeriod?.start?.slice(0, 10) || ''} onChange={(start) => schedule({ boundsDuration: undefined, boundsRange: undefined, boundsPeriod: { ...repeat.boundsPeriod, start: start || undefined } })} />
      <Input label="Dosage end date" type="date" value={repeat.boundsPeriod?.end?.slice(0, 10) || ''} onChange={(end) => schedule({ boundsDuration: undefined, boundsRange: undefined, boundsPeriod: { ...repeat.boundsPeriod, end: end || undefined } })} />
      <Select label="As needed" value={dose.asNeededBoolean === undefined ? '' : dose.asNeededBoolean ? 'yes' : 'no'} options={[{ value: 'yes', label: 'As needed' }, { value: 'no', label: 'Scheduled' }]} onChange={(value) => set({ asNeededBoolean: value ? value === 'yes' : undefined, asNeededCodeableConcept: undefined })} />
      <Input label="As-needed reason" value={getCodeableConceptText(dose.asNeededCodeableConcept)} onChange={(text) => set({ asNeededBoolean: text ? undefined : dose.asNeededBoolean, asNeededCodeableConcept: text ? { text } : undefined })} />
      <Input label="Additional instructions" value={dose.additionalInstruction?.map(getCodeableConceptText).join('; ') || ''} onChange={(text) => set({ additionalInstruction: text ? [{ text }] : undefined })} />
      <Input label="Patient instructions" value={dose.patientInstruction || ''} onChange={(patientInstruction) => set({ patientInstruction: patientInstruction || undefined })} />
    </div><details><summary>All dosage details</summary><DosageReview values={[dose]} /></details><button type="button" className="secondary-button compact" onClick={() => onChange(values.filter((_, position) => position !== index))}>Remove dosage</button></fieldset>
  })}<button type="button" className="secondary-button compact" onClick={() => onChange([...values, {}])}>Add dosage</button></>
}

export function MedicationStatementForm({ value: form, data, disabled, onChange }: { value: StatementForm; data: StatementCreateData; disabled: boolean; onChange: (value: StatementForm) => void }) {
  const set = <K extends keyof StatementForm>(key: K, value: StatementForm[K]) => onChange({ ...form, [key]: value })
  const medication = form.medication.medicationCodeableConcept
  const selectedCode = MEDICATION_CATALOG.find(([code]) => medication?.coding?.some((coding) => coding.system === 'http://www.nlm.nih.gov/research/umls/rxnorm' && coding.code === code))?.[0]
  const medicationValue = form.medication.medicationReference?.reference || (selectedCode ? `code:${selectedCode}` : medication ? 'copied' : '')
  const medications = [...MEDICATION_CATALOG.map(([code, label]) => ({ value: `code:${code}`, label })),
    ...getResourceReferenceChoices(data.options, ['Medication'])]
  if (medicationValue === 'copied') medications.push({ value: 'copied', label: getCodeableConceptText(medication) || 'Medication copied from request' })
  return <fieldset disabled={disabled} className="device-form-fields">
    <Select label="Based on MedicationRequest (optional)" value={form.basedOn} options={data.requests.map((choice) => ({ value: choice.reference, label: choice.display }))} onChange={(reference) => onChange(selectStatementRequest(form, reference, data))} />
    <fieldset className="toc-section-card"><legend>Medication</legend>
      <fieldset disabled={Boolean(form.basedOn)} className="device-form-fields"><Select label="Medication" required value={medicationValue} options={medications} onChange={(value) => set('medication', value.startsWith('code:') ? { medicationCodeableConcept: catalogMedication(value.slice(5)) } : value ? { medicationReference: { reference: value, display: data.options.find((option) => option.reference === value)?.display } } : {})} /></fieldset>
      {form.basedOn ? <p className="helper-text">Medication and dosage come from the selected request. Clear Based on MedicationRequest to edit them.</p> : null}
      <div className="toc-metadata-grid"><Select label="Status" required value={form.status} options={choices(STATEMENT_STATUSES)} onChange={(value) => set('status', value as StatementForm['status'])} />
        <Input label="Date asserted" type="date" value={form.dateAsserted} onChange={(value) => set('dateAsserted', value)} />
        <Select label="Information source" value={form.informationSource} options={getResourceReferenceChoices(data.options, SOURCE_TYPES)} onChange={(value) => set('informationSource', value)} />
        <Select label="Effective date representation" value={form.effectiveKind} options={[{ value: 'date', label: 'Date' }, { value: 'period', label: 'Date range' }]} onChange={(value) => set('effectiveKind', value as StatementForm['effectiveKind'])} />
        {form.effectiveKind ? <Input label={form.effectiveKind === 'date' ? 'Effective date' : 'Effective start date'} type="date" value={form.effectiveStart} onChange={(value) => set('effectiveStart', value)} /> : null}
        {form.effectiveKind === 'period' ? <Input label="Effective end date" type="date" value={form.effectiveEnd} onChange={(value) => set('effectiveEnd', value)} /> : null}
      </div>
    </fieldset>
    <fieldset className="toc-section-card"><legend>Dosage</legend>{form.basedOn ? <DosageReview values={form.dosage} /> : <DosageEditor values={form.dosage} onChange={(value) => set('dosage', value)} />}</fieldset>
    <fieldset className="toc-section-card"><legend>Adherence</legend><p className="helper-text">Record reported adherence for the effective period. Leave unselected when no adherence assertion is being made.</p>
      <Select label="Adherence" value={form.adherence} options={choices(ADHERENCE_CODES)} onChange={(value) => onChange({ ...form, adherence: value, adherenceReason: value ? form.adherenceReason : '' })} />
      {form.adherence ? <><div className="field-group"><label>Adherence reason<input list="statement-adherence-reasons" value={form.adherenceReason} onChange={(event) => set('adherenceReason', event.target.value)} /></label></div>
        <datalist id="statement-adherence-reasons">{['Cost', 'Side effects', 'Forgot doses', 'Difficulty obtaining medication', 'Following clinician instructions', 'Patient preference'].map((value) => <option key={value} value={value} />)}</datalist></> : null}
    </fieldset>
    <details><summary>Additional details</summary><div className="device-form-fields"><div className="toc-metadata-grid">
      <Select label="Encounter" value={form.context} options={getResourceReferenceChoices(data.options, ['Encounter'])} onChange={(value) => set('context', value)} />
      <Select label="Category" value={form.category} options={choices(['inpatient', 'outpatient', 'community', 'patientspecified'])} onChange={(value) => set('category', value)} />
      <Input label="Status reason" value={form.statusReason} onChange={(value) => set('statusReason', value)} />
    </div><TransferList label="Reason references" showDates options={getResourceTransferChoices(data.options, REASON_TYPES)} values={form.reasonReferences} disabled={disabled} onChange={(value) => set('reasonReferences', value)} /></div></details>
    <div className="field-group"><label htmlFor="statement-notes">Notes</label><textarea id="statement-notes" rows={4} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></div>
  </fieldset>
}
