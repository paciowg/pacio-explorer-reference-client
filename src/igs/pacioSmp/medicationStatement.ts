/** Defines the sample medication catalog and constructs SMP statements without owning form state or transport. */
import type { CodeableConcept, MedicationStatement } from 'fhir/r4'

export const SMP_STATEMENT = 'http://hl7.org/fhir/us/smp/StructureDefinition/smp-medicationstatement'
export const SMP_ADHERENCE = 'http://hl7.org/fhir/5.0/StructureDefinition/extension-MedicationStatement.adherence'
export const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm'

// Sample-data codes and displays supplied by the project; duplicate brand aliases share one choice.
export const MEDICATION_CATALOG = [
  ['1247756', 'docusate sodium 100 MG Oral Capsule [Colace]'],
  ['1310948', 'calcium carbonate 1500 MG / cholecalciferol 800 UNT Oral Tablet'],
  ['1545664', 'empagliflozin 10 MG Oral Tablet [Jardiance]'],
  ['198046', 'nortriptyline 50 MG Oral Capsule'],
  ['198052', 'ondansetron 4 MG Oral Tablet'],
  ['200031', 'carvedilol 6.25 MG Oral Tablet'],
  ['242590', 'ferrous gluconate 240 MG Oral Tablet'],
  ['282465', 'calcium carbonate 1250 MG Oral Tablet'],
  ['309362', 'clopidogrel 75 MG Oral Tablet'],
  ['310325', 'ferrous sulfate 325 MG Oral Tablet'],
  ['310489', '24 HR glipiZIDE 2.5 MG Extended Release Oral Tablet'],
  ['311048', 'insulin isophane, human 70 UNT/ML / insulin, regular, human 30 UNT/ML Injectable Suspension'],
  ['312940', 'sertraline 25 MG Oral Tablet'],
  ['313782', 'acetaminophen 325 MG Oral Tablet'],
  ['617320', 'atorvastatin 40 MG Oral Tablet [Lipitor]'],
  ['665042', 'sitagliptin 50 MG Oral Tablet'],
  ['702249', 'ferrous sulfate 44 MG/ML Oral Solution'],
  ['861007', 'metFORMIN hydrochloride 500 MG Oral Tablet'],
  ['861652', 'pitavastatin calcium 4 MG Oral Tablet'],
  ['876193', 'polyethylene glycol 3350 17000 MG Powder for Oral Solution'],
] as const

export const ADHERENCE_CODES = ['taking', 'taking-as-directed', 'taking-not-as-directed', 'not-taking', 'on-hold',
  'on-hold-as-directed', 'on-hold-not-as-directed', 'stopped', 'stopped-as-directed', 'stopped-not-as-directed', 'unknown'] as const
export const ADHERENCE_REASON_SYSTEM = 'http://snomed.info/sct'
// Authoring selection only; Other is submitted as CodeableConcept.text, never as a terminology code.
export const OTHER_ADHERENCE_REASON = '__other__'
// Demo subset of the FHIR R5 reason-medication-status-codes expansion; UI labels stay separate from coding displays.
export const ADHERENCE_REASONS = [
  { code: '182864000', display: 'Drug not taken - side-effects', label: 'Not taken because of side effects' },
  { code: '182872003', display: 'Drug discontinued - too expensive', label: 'Stopped taking medication because of cost' },
  { code: '182840001', display: 'Drug treatment stopped - medical advice', label: 'Stopped on clinician advice' },
  { code: '266711001', display: 'Drug not taken - problem swallowing', label: 'Not taken because swallowing is difficult' },
  { code: '182834008', display: 'Drug course completed', label: 'Medication course completed' },
  { code: '408354007', display: 'Drug treatment still needed', label: 'Treatment remains necessary' },
  { code: '408355008', display: 'Drug treatment no longer needed', label: 'Treatment is no longer necessary' },
] as const

export function adherenceReasonConcept(code: string, text = ''): CodeableConcept | undefined {
  if (!code) return undefined
  if (code === OTHER_ADHERENCE_REASON) {
    if (!text.trim()) throw new Error('Enter an adherence reason for Other.')
    return { text: text.trim() }
  }
  const choice = ADHERENCE_REASONS.find((reason) => reason.code === code)
  if (!choice) throw new Error('Select a supported adherence reason.')
  return { coding: [{ system: ADHERENCE_REASON_SYSTEM, code: choice.code, display: choice.display }] }
}

export function adherenceReasonCode(concept: CodeableConcept | undefined) {
  return concept?.coding?.find((coding) => coding.system === ADHERENCE_REASON_SYSTEM && ADHERENCE_REASONS.some((reason) => reason.code === coding.code))?.code
}
export const STATEMENT_STATUSES = ['active', 'completed', 'intended', 'stopped', 'on-hold', 'unknown', 'not-taken'] as const
export const MEDICATION_ROUTES = [
  ['PO', 'Oral'], ['SC', 'Subcutaneous'], ['IM', 'Intramuscular'], ['IV', 'Intravenous'], ['RESPINH', 'Inhalation'], ['TOP', 'Topical'],
] as const

export function catalogMedication(code: string): CodeableConcept {
  const choice = MEDICATION_CATALOG.find(([value]) => value === code)
  if (!choice) throw new Error('Select a medication from the sample catalog.')
  return { coding: [{ system: RXNORM, code: choice[0], display: choice[1] }] }
}

export type SmpStatementInput = Pick<MedicationStatement, 'subject' | 'status' | 'medicationCodeableConcept' | 'medicationReference' |
  'basedOn' | 'effectiveDateTime' | 'effectivePeriod' | 'dateAsserted' | 'informationSource' | 'dosage' | 'context' |
  'category' | 'statusReason' | 'reasonReference' | 'note'> & { adherence?: string; adherenceReason?: string; adherenceReasonText?: string }

export function buildSmpMedicationStatement(input: SmpStatementInput): MedicationStatement {
  const { adherence, adherenceReason, adherenceReasonText, ...fields } = structuredClone(input)
  if (!STATEMENT_STATUSES.includes(fields.status as typeof STATEMENT_STATUSES[number])) throw new Error('Select a medication-use status.')
  if (!fields.subject.reference) throw new Error('A patient is required.')
  if (Number(Boolean(fields.medicationCodeableConcept)) + Number(Boolean(fields.medicationReference)) !== 1) throw new Error('Select exactly one medication.')
  if (fields.medicationCodeableConcept && !fields.medicationCodeableConcept.coding?.some((coding) => coding.system && coding.code)) throw new Error('A coded medication is required.')
  if (fields.medicationReference && !fields.medicationReference.reference) throw new Error('Select an existing Medication.')
  if (fields.effectiveDateTime && fields.effectivePeriod) throw new Error('Choose an effective date or date range.')
  if (adherence && !ADHERENCE_CODES.includes(adherence as typeof ADHERENCE_CODES[number])) throw new Error('Select a supported adherence value.')
  if (!adherence && adherenceReason?.trim()) throw new Error('Select adherence before providing an adherence reason.')
  const reason = adherenceReasonConcept(adherenceReason || '', adherenceReasonText)
  // This demo intentionally permits all status/adherence combinations without clinical warnings.
  return { resourceType: 'MedicationStatement', meta: { profile: [SMP_STATEMENT] }, ...fields,
    ...(adherence ? { extension: [{ url: SMP_ADHERENCE, extension: [
      { url: 'code', valueCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/CodeSystem/medication-statement-adherence', code: adherence,
        display: adherence.replaceAll('-', ' ') }] } },
      ...(reason ? [{ url: 'reason', valueCodeableConcept: reason }] : []),
    ] }] } : {}) }
}
