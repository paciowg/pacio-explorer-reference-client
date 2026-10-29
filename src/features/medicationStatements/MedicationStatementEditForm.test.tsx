/** Verifies existing information renders as text while only amendment fields are exposed as controls. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { externalMedicationStatement as original } from '../../test/fixtures/externalMedicationStatement'
import { MedicationStatementEditForm } from './MedicationStatementEditForm'
import { initialStatementEdit } from './statementEditModel'
import { ADHERENCE_REASONS, OTHER_ADHERENCE_REASON } from '../../igs/pacioSmp/medicationStatement'

describe('statement edit form', () => {
  it('renders clinical context as heading/value text, existing notes separately, and only four amendment fields', () => {
    const html = renderToStaticMarkup(<MedicationStatementEditForm data={{ patient: { resourceType: 'Patient', id: 'p' }, original,
      details: { groups: [{ fields: [{ label: 'Medication', values: ['Externally compounded medication'] }, { label: 'Dosage', values: ['Complex instructions'] }, { label: 'Notes', values: ['Existing authored note'] }] }] } }}
      value={initialStatementEdit(original)} disabled={false} onChange={() => {}} />)
    expect(html).toContain('<dt>Medication</dt><dd>Externally compounded medication</dd>')
    expect(html).toContain('<dt>Dosage</dt><dd>Complex instructions</dd>')
    expect(html).toContain('<dt>Notes</dt><dd>Existing authored note</dd>')
    expect(html.match(/<select /g)).toHaveLength(3)
    expect(html).not.toContain('<input ')
    expect(html).not.toContain('<datalist')
    expect(html).toContain('Existing: Following original instructions')
    for (const reason of ADHERENCE_REASONS) expect(html).toContain(`<option value="${reason.code}">${reason.label}</option>`)
    expect(html.match(/<textarea /g)).toHaveLength(1)
    expect(html).toContain('New note</label><textarea id="statement-edit-note" rows="4"')
    expect(html).toContain('No recorded adherence')
    expect(html).toContain('value="unknown"')
    expect(html).toContain('value="entered-in-error"')
    expect(html).not.toContain('Destination FHIR server')
    expect(html).not.toContain('Based on MedicationRequest (optional)')
  })
  it('shows unsupported existing adherence values rather than substituting an empty or unknown assertion', () => {
    const custom = structuredClone(original)
    custom.extension![1].extension![0].valueCodeableConcept = { text: 'External value' }
    const html = renderToStaticMarkup(<MedicationStatementEditForm data={{ patient: { resourceType: 'Patient', id: 'p' }, original: custom, details: null }} value={initialStatementEdit(custom)} disabled onChange={() => {}} />)
    expect(html).toContain('Existing: External value')
    expect(html).toContain('<fieldset disabled=""')
  })
  it('retains the legacy reason option after selecting a supported replacement so it can be restored before saving', () => {
    const html = renderToStaticMarkup(<MedicationStatementEditForm data={{ patient: { resourceType: 'Patient', id: 'p' }, original, details: null }}
      value={{ ...initialStatementEdit(original), adherence: 'not-taking', adherenceReason: '182872003' }} disabled={false} onChange={() => {}} />)
    expect(html).toContain('Existing: Following original instructions')
    expect(html).toContain('<option value="182872003" selected="">Stopped taking medication because of cost</option>')
  })
  it('selects Other and populates the text field for an existing text-only reason', () => {
    const textOnly = structuredClone(original)
    textOnly.extension![1].extension![1].valueCodeableConcept = { text: 'Following clinician instructions' }
    const html = renderToStaticMarkup(<MedicationStatementEditForm data={{ patient: { resourceType: 'Patient', id: 'p' }, original: textOnly, details: null }} value={initialStatementEdit(textOnly)} disabled={false} onChange={() => {}} />)
    expect(html).toContain(`<option value="${OTHER_ADHERENCE_REASON}" selected="">Other</option>`)
    expect(html).toContain('Other adherence reason</label><input')
    expect(html).toContain('value="Following clinician instructions"')
    expect(html).not.toContain('Existing: Following clinician instructions')
  })
})
