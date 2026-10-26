/** Constructs SMP Lists, collection envelopes, and indexes independently of React and server transport. */
import type { Bundle, BundleEntry, CodeableConcept, DocumentReference, Identifier, List, Medication, MedicationStatement, Reference, Resource } from 'fhir/r4'
import { calendarDateValue } from '../../lib/dateTime'

export const SMP_BASE = 'http://hl7.org/fhir/us/smp/StructureDefinition/'
export const SMP_LIST = `${SMP_BASE}smp-medication-list`
export const SMP_BUNDLE = `${SMP_BASE}smp-bundle`
export const SMP_INDEX = `${SMP_BASE}smp-bundle-documentreference`
export const SMP_TYPE = { system: 'http://loinc.org', code: '70006-2', display: 'Medication Management Note' }
export const LIST_TYPES = [
  ['104202-7', 'Active medication list'], ['104203-5', 'Reconciled medication list'],
  ['104204-3', 'Discharged medication list'], ['104205-0', 'Patient generated medication list'],
  ['104206-8', 'Private medication list'], ['104207-6', 'Medication administration list'],
  ['104208-4', 'Medication list for public health AndOr CDC reporting'], ['104209-2', 'Transfer medication list'],
] as const
export const EMPTY_REASONS = [
  ['nilknown', 'No known medications'], ['notasked', 'Medication information not asked'],
  ['withheld', 'Information withheld'], ['unavailable', 'Information unavailable'],
  ['notstarted', 'Collection not started'], ['closed', 'All entries removed'],
] as const
export type SmpIssue = { severity: 'error'; resource: string; path: string; message: string }
export type SmpResolver = (reference: string | undefined, owner?: Resource) => Resource | undefined
const text = (concept: CodeableConcept | undefined) => concept?.text?.trim() || concept?.coding?.find((c) => c.code || c.display)?.display || concept?.coding?.find((c) => c.code)?.code || ''
const hasConcept = (concept: CodeableConcept | undefined) => Boolean(text(concept))
const targetType = (ref: Reference | undefined, owner: Resource, resolve?: SmpResolver) => resolve?.(ref?.reference, owner)?.resourceType || ref?.reference?.match(/(?:^|\/)([A-Z][A-Za-z]+)\/[^/]+(?:\/_history\/[^/]+)?$/)?.[1]

export function uuidIdentifier(): Identifier {
  return { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${crypto.randomUUID()}` }
}

export function validateSmpMedicationStatement(statement: MedicationStatement, samePatient: (ref: string | undefined) => boolean, resolve?: SmpResolver): SmpIssue[] {
  const issues: SmpIssue[] = []
  const add = (path: string, message: string) => issues.push({ severity: 'error', resource: `MedicationStatement/${statement.id || '?'}`, path, message })
  if (!['active', 'completed', 'intended', 'stopped', 'on-hold', 'unknown', 'not-taken'].includes(statement.status)) add('status', 'Select a valid statement that is not entered in error.')
  if (!samePatient(statement.subject?.reference)) add('subject', 'Statement does not identify the selected patient.')
  if (Number(Boolean(statement.medicationCodeableConcept)) + Number(Boolean(statement.medicationReference)) !== 1) add('medication[x]', 'Exactly one medication choice is required.')
  if (statement.medicationCodeableConcept && !hasConcept(statement.medicationCodeableConcept)) add('medicationCodeableConcept', 'Medication content is missing.')
  if (statement.medicationReference) {
    const medication = resolve?.(statement.medicationReference.reference, statement) as Medication | undefined
    if (!medication || medication.resourceType !== 'Medication' || !hasConcept(medication.code) || !['active', 'inactive', 'entered-in-error'].includes(medication.status || '')) add('medicationReference', 'Referenced Medication requires a code and valid status.')
  }
  for (const [field, refs, types] of [
    ['basedOn', statement.basedOn, ['MedicationRequest']],
    ['partOf', statement.partOf, ['MedicationDispense', 'MedicationAdministration']],
    ['informationSource', statement.informationSource ? [statement.informationSource] : [], ['Patient', 'Practitioner', 'PractitionerRole', 'RelatedPerson']],
  ] as const) {
    for (const ref of refs || []) if (!types.includes(targetType(ref, statement, resolve) as never)) add(field, `Expected ${types.join(' or ')} reference.`)
  }
  const adherence = statement.extension?.filter((e) => e.url === 'http://hl7.org/fhir/5.0/StructureDefinition/extension-MedicationStatement.adherence') || []
  if (adherence.length > 1 || adherence.some((e) => !hasConcept(e.extension?.find((x) => x.url === 'code')?.valueCodeableConcept))) add('extension.adherence', 'Adherence requires one code and at most one adherence extension.')
  return issues
}

export function isSmpList(list: List) {
  return list.meta?.profile?.some((p) => p.split('|')[0] === SMP_LIST) || list.code?.coding?.some((c) => c.system === 'http://loinc.org' && LIST_TYPES.some(([code]) => code === c.code)) || false
}

export function isSmpIndex(index: DocumentReference) {
  return index.meta?.profile?.some((p) => p.split('|')[0] === SMP_INDEX) || Boolean(index.type?.coding?.some((c) => c.system === SMP_TYPE.system && c.code === SMP_TYPE.code) &&
    index.content?.some((c) => c.attachment.contentType === 'application/fhir+json' && /(?:^|\/)Bundle\/[^/?#]+(?:\/_history\/[^/?#]+)?$/.test(c.attachment.url || '')))
}

export function validateSmpMedicationList(list: List, samePatient: (ref: string | undefined) => boolean, resolve?: SmpResolver, options: { validateStatements?: boolean } = {}): SmpIssue[] {
  const issues: SmpIssue[] = []
  const add = (path: string, message: string) => issues.push({ severity: 'error', resource: `List/${list.id || '?'}`, path, message })
  if (!['current', 'retired'].includes(list.status)) add('status', 'List must be current or retired.')
  if (!['snapshot', 'working', 'changes'].includes(list.mode)) add('mode', 'List mode is required.')
  if (!hasConcept(list.code)) add('code', 'Medication list type is required.')
  if (!samePatient(list.subject?.reference)) add('subject', 'List does not identify the selected patient.')
  if (!['Practitioner', 'PractitionerRole'].includes(targetType(list.source, list, resolve) || '')) add('source', 'A practitioner or practitioner role source is required.')
  if (!list.entry?.length && !hasConcept(list.emptyReason)) add('emptyReason', 'An empty List requires an explicit reason.')
  if (list.entry?.length && list.emptyReason) add('emptyReason', 'Entries and empty reason cannot be combined.')
  const seen = new Set<string>()
  for (const [i, entry] of (list.entry || []).entries()) {
    const ref = entry.item?.reference
    if (!ref || seen.has(ref)) add(`entry[${i}].item`, 'Missing or duplicate statement reference.')
    if (ref) seen.add(ref)
    if (list.mode !== 'working' && entry.date) add(`entry[${i}].date`, 'Entry dates require working mode.')
    if (list.mode !== 'changes' && entry.deleted !== undefined) add(`entry[${i}].deleted`, 'Deleted flags require changes mode.')
    if (targetType(entry.item, list, resolve) !== 'MedicationStatement') add(`entry[${i}].item`, 'List entries must reference MedicationStatements.')
    if (resolve) {
      const statement = resolve(ref, list)
      if (statement?.resourceType !== 'MedicationStatement') add(`entry[${i}].item`, 'Statement cannot be resolved.')
      else if (options.validateStatements !== false) issues.push(...validateSmpMedicationStatement(statement as MedicationStatement, samePatient, resolve))
      else if (!samePatient((statement as MedicationStatement).subject?.reference)) add(`entry[${i}].item`, 'Statement does not identify the selected patient.')
    }
  }
  return issues
}

function escape(value: string) { return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!) }

export function buildSmpMedicationList(input: { identifier: Identifier; title: string; typeCode: string; patient: Reference; source: Reference; date: string; statements: Reference[]; emptyReason?: string; notes?: string }): List {
  if (!input.title.trim()) throw new Error('Enter a List title.')
  const type = LIST_TYPES.find(([code]) => code === input.typeCode)
  if (!type) throw new Error('Select a medication list type.')
  if (new Set(input.statements.map((s) => s.reference)).size !== input.statements.length) throw new Error('Duplicate statement references.')
  const empty = EMPTY_REASONS.find(([code]) => code === input.emptyReason)
  if (!input.statements.length && !empty) throw new Error('Select statements or an explicit empty reason.')
  if (input.statements.length && input.emptyReason) throw new Error('Remove the empty reason when selecting statements.')
  const list: List = {
    resourceType: 'List', meta: { profile: [SMP_LIST] }, identifier: [input.identifier], status: 'current', mode: 'snapshot',
    title: input.title.trim(), code: { coding: [{ system: 'http://loinc.org', version: '2.80', code: type[0], display: type[1] }] },
    subject: input.patient, source: input.source, date: calendarDateValue(input.date, 'List date'),
    ...(input.statements.length ? { entry: input.statements.map((item) => ({ item })) } : { emptyReason: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/list-empty-reason', code: empty![0], display: empty![1] }] } }),
    ...(input.notes?.trim() ? { note: [{ text: input.notes.trim() }] } : {}),
    text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml"><h2>${escape(input.title.trim())}</h2><p>${escape(type[1])}; ${escape(input.date)}; ${escape(input.patient.display || input.patient.reference || '')}; Author: ${escape(input.source.display || input.source.reference || '')}</p><ul>${input.statements.length ? input.statements.map((s) => `<li>${escape(s.display || s.reference || '')}</li>`).join('') : `<li>${escape(empty![1])}</li>`}</ul></div>` },
  }
  const issues = validateSmpMedicationList(list, (ref) => ref === input.patient.reference)
  if (issues.length) throw new Error(issues.map((i) => i.message).join(' '))
  return structuredClone(list)
}

export function buildSmpCollection(input: { identifier: Identifier; timestamp: string; entries: BundleEntry[] }): Bundle {
  if (input.entries[0]?.resource?.resourceType !== 'List') throw new Error('An SMP collection must begin with a medication List.')
  return structuredClone({ resourceType: 'Bundle', meta: { profile: [SMP_BUNDLE] }, identifier: input.identifier, type: 'collection', timestamp: input.timestamp,
    entry: input.entries.map(({ fullUrl, resource }) => ({ fullUrl, resource })) })
}

export function buildSmpDocumentReference(input: { identifier: Identifier; title: string; timestamp: string; patient: Reference; bundleUrl: string; author?: Reference }): DocumentReference {
  return { resourceType: 'DocumentReference', meta: { profile: [SMP_INDEX] }, masterIdentifier: input.identifier, identifier: [input.identifier], status: 'current',
    type: { coding: [SMP_TYPE] }, category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
    subject: input.patient, date: input.timestamp, description: input.title, ...(input.author ? { author: [input.author] } : {}),
    content: [{ attachment: { contentType: 'application/fhir+json', url: input.bundleUrl, title: input.title, creation: input.timestamp } }] }
}
