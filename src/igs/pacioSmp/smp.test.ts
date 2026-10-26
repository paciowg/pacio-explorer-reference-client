/** Verifies SMP construction and compatibility against the pinned constraints without changing imported resources. */
import { describe, expect, it } from 'vitest'
import type { List, Medication, MedicationStatement } from 'fhir/r4'
import { buildSmpCollection, buildSmpDocumentReference, buildSmpMedicationList, isSmpIndex, SMP_INDEX, SMP_LIST, validateSmpMedicationList, validateSmpMedicationStatement } from './smp'
import baselineList from './baseline/StructureDefinition-smp-medication-list.json'
import baselineIndex from './baseline/StructureDefinition-smp-bundle-documentreference.json'

const statement: MedicationStatement = { resourceType: 'MedicationStatement', id: 's', status: 'not-taken', medicationCodeableConcept: { text: 'Aspirin' }, subject: { reference: 'Patient/p' } }
const input = { identifier: { system: 'urn:ietf:rfc:3986', value: 'urn:uuid:5c41a001-5555-4444-8888-555555555555' }, title: 'Discharge <review>', typeCode: '104204-3', patient: { reference: 'Patient/p' }, source: { reference: 'PractitionerRole/r', display: 'A & B' }, date: '2026-10-26', statements: [{ reference: 'MedicationStatement/s', display: 'Aspirin' }] }

describe('SMP construction', () => {
  it('builds a dated reusable snapshot List with escaped narrative and source-independent references', () => {
    const copy = structuredClone(input)
    const list = buildSmpMedicationList(input)
    expect(list.meta?.profile).toEqual([SMP_LIST])
    expect(list).toMatchObject({ mode: 'snapshot', status: 'current', date: '2026-10-26', source: { reference: 'PractitionerRole/r' } })
    expect(list.entry?.[0]).toEqual({ item: input.statements[0] })
    expect(list.text?.div).toContain('Discharge &lt;review&gt;')
    expect(list.text?.div).toContain('A &amp; B')
    expect(input).toEqual(copy)
    expect(baselineList.snapshot.element.find((e) => e.id === 'List.source')?.min).toBe(1)
  })
  it('requires an explicit empty reason and rejects dates, duplicates, and conflicting choices', () => {
    expect(() => buildSmpMedicationList({ ...input, statements: [] })).toThrow('explicit empty reason')
    const empty = buildSmpMedicationList({ ...input, statements: [], emptyReason: 'unavailable' })
    expect(empty.entry).toBeUndefined()
    expect(empty.emptyReason?.coding?.[0].code).toBe('unavailable')
    expect(() => buildSmpMedicationList({ ...input, date: '2026-02-30' })).toThrow('date')
    expect(() => buildSmpMedicationList({ ...input, statements: [input.statements[0], input.statements[0]] })).toThrow('Duplicate')
    expect(() => buildSmpMedicationList({ ...input, emptyReason: 'nilknown' })).toThrow('empty reason')
  })
  it('builds a collection with no transaction/search envelope and an SMP index satisfying inherited category', () => {
    const list = buildSmpMedicationList(input)
    const bundle = buildSmpCollection({ identifier: input.identifier, timestamp: '2026-10-26T12:00:00Z', entries: [{ fullUrl: 'urn:uuid:a', resource: list, request: { method: 'POST', url: 'List' }, search: { mode: 'match' } }] })
    expect(bundle.type).toBe('collection')
    expect(bundle.total).toBeUndefined()
    expect(bundle.entry?.[0].request).toBeUndefined()
    expect(bundle.entry?.[0].search).toBeUndefined()
    const index = buildSmpDocumentReference({ identifier: input.identifier, title: input.title, timestamp: bundle.timestamp!, patient: { reference: 'Patient/destination' }, bundleUrl: 'https://example.test/fhir/Bundle/b' })
    expect(index.meta?.profile).toEqual([SMP_INDEX])
    expect(isSmpIndex(index)).toBe(true)
    expect(index.docStatus).toBeUndefined()
    expect(index.masterIdentifier).toEqual(bundle.identifier)
    expect(index.category?.[0].coding?.[0].code).toBe('clinical-note')
    const type = baselineIndex.snapshot.element.find((e) => e.id === 'DocumentReference.type')
    expect(index.type).toEqual(type?.patternCodeableConcept)
    expect(baselineIndex.snapshot.element.find((e) => e.id === 'DocumentReference.category')?.min).toBe(1)
  })
})

describe('SMP compatibility', () => {
  it('allows an undeclared historical/not-taken statement without altering its profile', () => {
    expect(validateSmpMedicationStatement(statement, (r) => r === 'Patient/p')).toEqual([])
    expect(statement.meta).toBeUndefined()
    for (const status of ['active', 'completed', 'stopped', 'on-hold', 'intended', 'unknown', 'not-taken'] as const) expect(validateSmpMedicationStatement({ ...statement, status }, () => true)).toEqual([])
  })
  it('rejects mismatched patients, conflicting medication choices, invalid targets and missing medication content', () => {
    const invalid: MedicationStatement = { ...statement, status: 'entered-in-error', medicationReference: { reference: 'Medication/m' }, basedOn: [{ reference: 'CarePlan/c' }] }
    const paths = validateSmpMedicationStatement(invalid, () => false).map((i) => i.path)
    expect(paths).toEqual(expect.arrayContaining(['status', 'subject', 'medication[x]', 'medicationReference', 'basedOn']))
    expect(validateSmpMedicationStatement({ ...statement, medicationCodeableConcept: {} }, () => true)[0].path).toBe('medicationCodeableConcept')
  })
  it('resolves contained medications and enforces SMP Medication status', () => {
    const s: MedicationStatement = { ...statement, medicationCodeableConcept: undefined, medicationReference: { reference: '#med' }, contained: [{ resourceType: 'Medication', id: 'med', code: { text: 'Aspirin' }, status: 'active' } as Medication] }
    expect(validateSmpMedicationStatement(s, () => true, (_, owner) => (owner as MedicationStatement).contained?.[0])).toEqual([])
    delete (s.contained![0] as Medication).status
    expect(validateSmpMedicationStatement(s, () => true, () => s.contained![0])).toHaveLength(1)
  })
  it('checks snapshot entry invariants, empty reasons and unresolved members', () => {
    const list: List = { ...buildSmpMedicationList(input), entry: [{ item: { reference: 'MedicationStatement/s' }, date: '2026-10-01', deleted: false }], emptyReason: { text: 'unknown' } }
    expect(validateSmpMedicationList(list, () => true, () => undefined).map((i) => i.path)).toEqual(expect.arrayContaining(['entry[0].date', 'entry[0].deleted', 'emptyReason', 'entry[0].item']))
  })
})
