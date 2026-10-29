/** Proves limited edits preserve externally authored fields, terminology, annotations, narrative, and extensions. */
import type { MedicationStatement } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { externalMedicationStatement as original } from '../../test/fixtures/externalMedicationStatement'
import { ADHERENCE_CODES, ADHERENCE_REASONS, adherenceReasonConcept, OTHER_ADHERENCE_REASON, SMP_ADHERENCE } from '../../igs/pacioSmp/medicationStatement'
import { buildStatementUpdate, EXISTING_ADHERENCE, EXISTING_ADHERENCE_REASON, hasStatementEdits, initialStatementEdit, statementAdherence } from './statementEditModel'

const timestamp = '2026-10-29T12:00:00Z'
describe('limited statement updates', () => {
  it('round trips unchanged content without clinical defaults or an SMP profile declaration', () => {
    const edit = initialStatementEdit(original)
    expect(edit).toEqual({ status: 'active', adherence: 'taking', adherenceReason: EXISTING_ADHERENCE_REASON, adherenceReasonText: '', newNote: '' })
    expect(hasStatementEdits(original, edit)).toBe(false)
    expect(hasStatementEdits(original, { ...edit, newNote: ' \n ' })).toBe(false)
    expect(buildStatementUpdate(original, edit, timestamp)).toEqual(original)
  })
  it('changes only status, retaining complete complex external content and coded adherence', () => {
    const before = structuredClone(original)
    const edit = { ...initialStatementEdit(original), status: 'entered-in-error' }
    expect(hasStatementEdits(original, edit)).toBe(true)
    expect(buildStatementUpdate(original, edit, timestamp)).toEqual({ ...original, status: 'entered-in-error' })
    expect(original).toEqual(before)
  })
  it('replaces only the selected adherence code while preserving its coded reason and unrelated children', () => {
    const updated = buildStatementUpdate(original, { ...initialStatementEdit(original), adherence: 'not-taking' }, timestamp)
    const expected = structuredClone(original)
    statementAdherence(expected)!.extension![0].valueCodeableConcept = { coding: [{ system: 'http://hl7.org/fhir/CodeSystem/medication-statement-adherence', code: 'not-taking', display: 'not taking' }] }
    expect(updated).toEqual(expected)
    expect(statementAdherence(updated)?.extension?.[0].id).toBe('original-code')
  })
  it('preserves a coded reason when unchanged, replaces it only when edited, and supports explicit removal', () => {
    const reason = statementAdherence(original)?.extension?.[1]
    const update = (value: string) => buildStatementUpdate(original, { ...initialStatementEdit(original), adherenceReason: value }, timestamp)
    expect(statementAdherence(update(EXISTING_ADHERENCE_REASON))?.extension?.[1]).toEqual(reason)
    expect(statementAdherence(update('182872003'))?.extension?.[1]).toEqual({ ...reason, valueCodeableConcept: adherenceReasonConcept('182872003') })
    expect(statementAdherence(update(''))?.extension?.map((child) => child.url)).toEqual(['code', 'https://example.test/adherence-detail'])
  })
  it('adds or removes the supported extension without touching unrelated extensions', () => {
    const without: MedicationStatement = { ...original, extension: original.extension?.filter((extension) => extension.url !== SMP_ADHERENCE) }
    const added = buildStatementUpdate(without, { ...initialStatementEdit(without), adherence: 'unknown', adherenceReason: '408354007' }, timestamp)
    expect(added.extension?.[0]).toEqual(without.extension?.[0])
    expect(statementAdherence(added)?.extension?.map((child) => child.url)).toEqual(['code', 'reason'])
    const cleared = buildStatementUpdate(original, { ...initialStatementEdit(original), adherence: '', adherenceReason: '' }, timestamp)
    expect(cleared).toEqual(without)
    const onlyAdherence: MedicationStatement = { ...original, extension: [statementAdherence(original)!] }
    expect(buildStatementUpdate(onlyAdherence, { ...initialStatementEdit(onlyAdherence), adherence: '', adherenceReason: '' }, timestamp).extension).toBeUndefined()
  })
  it('appends one timestamped note without changing earlier notes or inventing an author', () => {
    const updated = buildStatementUpdate(original, { ...initialStatementEdit(original), newNote: ' New information ' }, timestamp)
    expect(updated).toEqual({ ...original, note: [...original.note!, { text: 'New information', time: timestamp }] })
    expect(updated.dateAsserted).toBe('2021-03')
    expect(original.note).toHaveLength(2)
  })
  it('keeps unknown existing adherence content editable without converting it to the known terminology', () => {
    const custom = structuredClone(original)
    statementAdherence(custom)!.extension![0].valueCodeableConcept = { text: 'External adherence assertion', coding: [{ system: 'urn:other', code: 'custom' }] }
    const edit = initialStatementEdit(custom)
    expect(edit.adherence).toBe(EXISTING_ADHERENCE)
    expect(buildStatementUpdate(custom, { ...edit, status: 'on-hold' }, timestamp)).toEqual({ ...custom, status: 'on-hold' })
    const withReason = buildStatementUpdate(custom, { ...edit, adherenceReason: '182840001' }, timestamp)
    expect(statementAdherence(withReason)?.extension?.[0]).toEqual(statementAdherence(custom)?.extension?.[0])
  })
  it('does not run creation validation or require completing unrelated imported fields', () => {
    const incomplete = { resourceType: 'MedicationStatement', id: 'incomplete', subject: { reference: 'Patient/p' } } as MedicationStatement
    const updated = buildStatementUpdate(incomplete, { ...initialStatementEdit(incomplete), newNote: 'Added note' }, timestamp)
    expect(updated).toEqual({ ...incomplete, note: [{ text: 'Added note', time: timestamp }] })
  })
  it.each(ADHERENCE_REASONS)('matches supported reason $code by system and code and preserves its original representation', (reason) => {
    const known = structuredClone(original)
    statementAdherence(known)!.extension![1].valueCodeableConcept = {
      coding: [{ system: 'urn:external:mapping', code: 'mapped' }, { system: 'http://snomed.info/sct', code: reason.code, display: 'External display' }], text: 'External preferred text',
    }
    const edit = initialStatementEdit(known)
    expect(edit.adherenceReason).toBe(reason.code)
    expect(hasStatementEdits(known, edit)).toBe(false)
    expect(buildStatementUpdate(known, { ...edit, adherence: 'not-taking' }, timestamp).extension?.[1].extension?.[1]).toEqual(known.extension?.[1].extension?.[1])
  })
  it('preserves free text or the same code in a different system rather than matching by label or code alone', () => {
    for (const valueCodeableConcept of [
      { text: ADHERENCE_REASONS[0].label },
      { coding: [{ system: 'urn:other-system', code: ADHERENCE_REASONS[0].code, display: ADHERENCE_REASONS[0].display }] },
    ]) {
      const external = structuredClone(original)
      statementAdherence(external)!.extension![1].valueCodeableConcept = valueCodeableConcept
      const edit = initialStatementEdit(external)
      expect(edit.adherenceReason).toBe(valueCodeableConcept.coding ? EXISTING_ADHERENCE_REASON : OTHER_ADHERENCE_REASON)
      expect(buildStatementUpdate(external, { ...edit, adherence: 'not-taking' }, timestamp).extension?.[1].extension?.[1]).toEqual(external.extension?.[1].extension?.[1])
      expect(statementAdherence(buildStatementUpdate(external, { ...edit, adherenceReason: '' }, timestamp))?.extension?.some((child) => child.url === 'reason')).toBe(false)
    }
  })
  it('allows changing Taking and its legacy reason to Not taking with a coded cost reason in one update', () => {
    const legacy = structuredClone(original)
    statementAdherence(legacy)!.extension![1].valueCodeableConcept = { text: 'Following clinician instructions' }
    const edit = initialStatementEdit(legacy)
    const updated = buildStatementUpdate(legacy, { ...edit, adherence: 'not-taking', adherenceReason: '182872003' }, timestamp)
    expect(statementAdherence(updated)?.extension?.[0].valueCodeableConcept?.coding?.[0].code).toBe('not-taking')
    expect(statementAdherence(updated)?.extension?.[1].valueCodeableConcept).toEqual(adherenceReasonConcept('182872003'))
    expect(() => buildStatementUpdate(legacy, { ...edit, adherenceReason: 'New free text' }, timestamp)).toThrow('supported adherence reason')
  })
  it('loads existing text as Other, detects text changes, and preserves original text content when untouched', () => {
    const legacy = structuredClone(original)
    statementAdherence(legacy)!.extension![1].valueCodeableConcept = { text: ' Following clinician instructions ' }
    const edit = initialStatementEdit(legacy)
    expect(edit).toMatchObject({ adherenceReason: OTHER_ADHERENCE_REASON, adherenceReasonText: ' Following clinician instructions ' })
    expect(hasStatementEdits(legacy, edit)).toBe(false)
    expect(buildStatementUpdate(legacy, { ...edit, status: 'on-hold' }, timestamp)).toEqual({ ...legacy, status: 'on-hold' })
    const changed = { ...edit, adherenceReasonText: ' New explanation ' }
    expect(hasStatementEdits(legacy, changed)).toBe(true)
    expect(statementAdherence(buildStatementUpdate(legacy, changed, timestamp))?.extension?.[1]).toEqual({
      ...statementAdherence(legacy)!.extension![1], valueCodeableConcept: { text: 'New explanation' },
    })
    expect(() => buildStatementUpdate(legacy, { ...edit, adherenceReasonText: ' ' }, timestamp)).toThrow('Enter an adherence reason for Other')
  })
  it('allows replacing unsupported coding with Other without affecting unrelated content', () => {
    const edit = { ...initialStatementEdit(original), adherenceReason: OTHER_ADHERENCE_REASON, adherenceReasonText: 'Specific patient explanation' }
    const updated = buildStatementUpdate(original, edit, timestamp)
    const expected = structuredClone(original)
    statementAdherence(expected)!.extension![1].valueCodeableConcept = { text: 'Specific patient explanation' }
    expect(updated).toEqual(expected)
  })
  it('ignores inactive Other text after switching back to a coded reason and supports clearing a text-only reason', () => {
    const known = structuredClone(original)
    statementAdherence(known)!.extension![1].valueCodeableConcept = adherenceReasonConcept('182872003')
    const edit = { ...initialStatementEdit(known), adherenceReasonText: 'Unsaved Other text' }
    expect(hasStatementEdits(known, edit)).toBe(false)
    expect(buildStatementUpdate(known, edit, timestamp)).toEqual(known)
    const legacy = structuredClone(original)
    statementAdherence(legacy)!.extension![1].valueCodeableConcept = { text: 'Original text' }
    const cleared = buildStatementUpdate(legacy, { ...initialStatementEdit(legacy), adherenceReason: '' }, timestamp)
    expect(statementAdherence(cleared)?.extension?.some((child) => child.url === 'reason')).toBe(false)
  })
  it('permits every supported adherence value with every status without combination warnings', () => {
    for (const adherence of ADHERENCE_CODES) expect(() => buildStatementUpdate(original, { ...initialStatementEdit(original), adherence, status: 'not-taken' }, timestamp)).not.toThrow()
    expect(() => buildStatementUpdate(original, { ...initialStatementEdit(original), status: 'invalid' }, timestamp)).toThrow('status')
  })
})
