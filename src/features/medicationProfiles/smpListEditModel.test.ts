/** Verifies List edits preserve imported content and entry metadata while validating explicitly changed fields and membership. */
import type { List, MedicationStatement, PractitionerRole } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { buildSmpMedicationList, SMP_LIST } from '../../igs/pacioSmp/smp'
import type { SmpChoices } from './smpData'
import { buildSmpListUpdate, EXISTING_LIST_VALUE, existingEntryValue, hasSmpListEdits, initialSmpListEdit, type SmpListEdit } from './smpListEditModel'

const base = 'https://source.test/fhir'
const timestamp = '2026-11-02T18:00:00Z'
const statement: MedicationStatement = { resourceType: 'MedicationStatement', id: 'new', status: 'entered-in-error', subject: { reference: 'Patient/p' }, medicationCodeableConcept: { text: 'Imported medication' } }
const author: PractitionerRole = { resourceType: 'PractitionerRole', id: 'new-author' }
const choices: SmpChoices = { patient: { resourceType: 'Patient', id: 'p' }, bundle: { resourceType: 'Bundle', type: 'collection' },
  authors: [{ resource: author, reference: 'PractitionerRole/new-author', display: 'Alex — Physician', label: 'PractitionerRole: Alex — Physician' }],
  options: [{ resource: statement, reference: 'MedicationStatement/new', display: 'Imported medication', label: 'Imported medication — entered-in-error' }] }
const original: List = { resourceType: 'List', id: 'list', status: 'retired', mode: 'working', title: 'Imported List',
  meta: { profile: [SMP_LIST, 'https://example.test/custom'], versionId: '3', lastUpdated: timestamp, tag: [{ code: 'original' }] },
  identifier: [{ system: 'https://example.test/list-id', value: '123' }],
  code: { coding: [{ system: 'http://loinc.org', code: '104206-8', display: 'Private medications' }], extension: [{ url: 'https://example.test/code', valueString: 'keep' }] },
  subject: { reference: `${base}/Patient/p`, display: 'Original patient', extension: [{ url: 'https://example.test/ref', valueBoolean: true }] },
  source: { reference: 'Practitioner/unavailable', display: 'Original author', identifier: { value: 'author-id' } },
  date: '2026-10-23T12:34:56-04:00', encounter: { reference: 'Encounter/e' },
  orderedBy: { text: 'Original order' }, extension: [{ url: 'https://example.test/list', valueString: 'keep' }],
  contained: [{ ...statement, id: 'contained' }],
  text: { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml">Original narrative</div>' },
  entry: [{ id: 'entry-a', item: { reference: `${base}/MedicationStatement/old`, display: 'Old medication', extension: [{ url: 'https://example.test/item', valueBoolean: true }] }, date: '2026-10', flag: { text: 'Imported flag' }, extension: [{ url: 'https://example.test/entry', valueString: 'keep' }] },
    { item: { reference: '#contained', display: 'Contained medication' } }],
  note: [{ text: 'Original note', authorString: 'Original author', time: '2026-10-23T12:34:56Z', extension: [{ url: 'https://example.test/note', valueString: 'keep' }] }, { text: 'Second note' }] }
const update = (patch: Partial<SmpListEdit>, list = original, data = choices) => buildSmpListUpdate(list, { ...initialSmpListEdit(list), ...patch }, data, base, 'p', timestamp)

describe('List update model', () => {
  it('preserves the complete original on initialization and does not identify any edits', () => {
    const edit = initialSmpListEdit(original)
    expect(edit.typeCode).toBe(EXISTING_LIST_VALUE)
    expect(edit.date).toBe(original.date)
    expect(edit.selected).toEqual([existingEntryValue(0), existingEntryValue(1)])
    expect(hasSmpListEdits(original, edit)).toBe(false)
    expect(update({})).toEqual(original)
    expect(update({})).not.toBe(original)
  })
  it('changes only the title and appends a timestamped note without altering imported data', () => {
    const before = structuredClone(original)
    expect(update({ title: ' Revised list ', notes: ' New observation ' })).toEqual({ ...original, title: 'Revised list', note: [...original.note!, { text: 'New observation', time: timestamp }] })
    expect(original).toEqual(before)
    expect(hasSmpListEdits(original, { ...initialSmpListEdit(original), notes: '  ' })).toBe(false)
  })
  it('preserves coding and reference metadata when default selections remain unchanged', () => {
    const list = { ...original, code: { ...original.code, coding: [{ system: 'http://loinc.org', code: '104202-7' }, { system: 'https://example.test/code', code: 'custom' }] }, source: { ...original.source, reference: author.resourceType + '/' + author.id } }
    expect(initialSmpListEdit(list).typeCode).toBe('104202-7')
    expect(update({ notes: 'Note' }, list).code).toEqual(list.code)
    expect(update({ notes: 'Note' }, list).source).toEqual(list.source)
  })
  it('replaces explicitly edited type, author, and date with valid creation choices', () => {
    const updated = update({ typeCode: '104203-5', author: 'PractitionerRole/new-author', date: '2026-11-02' })
    expect(updated).toEqual({ ...original, code: { coding: [{ system: 'http://loinc.org', version: '2.80', code: '104203-5', display: 'Reconciled medication list' }] },
      source: { reference: 'PractitionerRole/new-author', display: 'Alex — Physician' }, date: '2026-11-02' })
  })
  it('preserves retained entry order and metadata and appends new members with unprefixed displays', () => {
    const updated = update({ selected: ['MedicationStatement/new', existingEntryValue(0)] })
    expect(updated.entry).toEqual([original.entry![0], { item: { reference: 'MedicationStatement/new', display: 'Imported medication' } }])
    expect(updated.contained).toEqual(original.contained)
  })
  it('preserves duplicate and identifier-only original entries until explicitly removed', () => {
    const list = { ...original, entry: [original.entry![0], original.entry![0], { item: { identifier: { value: 'logical-statement' }, display: 'Logical statement' } }] }
    expect(update({ notes: 'Note' }, list).entry).toEqual(list.entry)
    expect(update({ selected: [existingEntryValue(1), existingEntryValue(2)] }, list).entry).toEqual(list.entry.slice(1))
  })
  it('requires an explicit reason when removing the last entry', () => {
    expect(() => update({ selected: [] })).toThrow('explicit reason')
    const updated = update({ selected: [], emptyReason: 'closed' })
    expect(updated.entry).toBeUndefined()
    expect(updated.emptyReason?.coding?.[0].code).toBe('closed')
  })
  it('preserves unknown empty reasons and removes them when members are added', () => {
    const list: List = { ...original, entry: undefined, emptyReason: { text: 'Imported reason', coding: [{ system: 'https://example.test', code: 'custom' }] } }
    expect(initialSmpListEdit(list).emptyReason).toBe(EXISTING_LIST_VALUE)
    expect(update({ notes: 'Note' }, list).emptyReason).toEqual(list.emptyReason)
    const updated = update({ selected: ['MedicationStatement/new'], emptyReason: '' }, list)
    expect(updated.emptyReason).toBeUndefined()
    expect(updated.entry).toHaveLength(1)
  })
  it('does not gate unrelated edits on missing fields or unfamiliar imported values', () => {
    const list: List = { ...original, title: undefined, code: undefined, date: '2026', source: { identifier: { value: 'logical-author' } }, entry: undefined, emptyReason: undefined }
    expect(update({ notes: 'Note' }, list)).toEqual({ ...list, note: [...list.note!, { text: 'Note', time: timestamp }] })
  })
  it.each([
    { title: '' }, { typeCode: 'unsupported' }, { author: 'Practitioner/missing' }, { date: '' }, { date: '2026-02-30' }, { selected: ['MedicationStatement/missing'] },
    { selected: ['existing-entry:999'] }, { selected: ['MedicationStatement/new', 'MedicationStatement/new'] },
  ])('rejects invalid explicit changes: %j', (patch) => {
    expect(() => update(patch)).toThrow()
  })
  it('checks the List, choices, and added statements belong to the current patient', () => {
    expect(() => update({ notes: 'Note' }, { ...original, subject: { reference: 'Patient/other' } })).toThrow('current patient')
    expect(() => update({ notes: 'Note' }, original, { ...choices, patient: { resourceType: 'Patient', id: 'other' } })).toThrow('current patient')
    const foreign = { ...choices, options: [{ ...choices.options[0], resource: { ...statement, subject: { reference: 'Patient/other' } } }] }
    expect(() => update({ selected: ['MedicationStatement/new'] }, original, foreign)).toThrow('current patient')
  })
  it('prevents adding a relative alias of a retained absolute statement reference', () => {
    const alias = { ...choices, options: [{ ...choices.options[0], reference: 'MedicationStatement/old', resource: { ...statement, id: 'old' } }] }
    expect(() => update({ selected: [existingEntryValue(0), 'MedicationStatement/old'] }, original, alias)).toThrow('Duplicate')
  })
  it('supports Lists produced by the creation builder without changing their identity or snapshot mode', () => {
    const list = { ...buildSmpMedicationList({ identifier: { value: 'original-id' }, title: 'Created List', typeCode: '104202-7', date: '2026-11-02', patient: { reference: 'Patient/p' }, source: { reference: 'PractitionerRole/new-author' }, statements: [{ reference: 'MedicationStatement/new' }] }), id: 'created' }
    expect(update({ title: 'Edited List' }, list)).toEqual({ ...list, title: 'Edited List' })
  })
})
