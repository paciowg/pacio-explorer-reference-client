/** Checks the form's visible medication restrictions, request locking, full dosage review, and reason selection pattern. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MedicationRequest } from 'fhir/r4'
import { ADHERENCE_REASONS, catalogMedication, OTHER_ADHERENCE_REASON } from '../../igs/pacioSmp/medicationStatement'
import { MedicationStatementForm } from './MedicationStatementForm'
import { initialStatementForm, selectStatementRequest } from './statementFormModel'
import type { StatementCreateData } from './statementCreateData'

const request: MedicationRequest = { resourceType: 'MedicationRequest', id: 'r', status: 'active', intent: 'order', subject: { reference: 'Patient/p' }, medicationCodeableConcept: catalogMedication('313782'), dosageInstruction: [
  { text: 'First instruction', maxDosePerLifetime: { value: 20, unit: 'mg' } }, { text: 'Second instruction', timing: { repeat: { dayOfWeek: ['fri'] } } },
] }
const data: StatementCreateData = { patient: { resourceType: 'Patient', id: 'p' }, warning: '', requests: [{ reference: 'MedicationRequest/r', display: 'Request', label: 'MedicationRequest: Request', resource: request, medication: { medicationCodeableConcept: request.medicationCodeableConcept } }], options: [
  { reference: 'Condition/c', label: 'Condition: Indication', display: 'Indication', resource: { resourceType: 'Condition', id: 'c', meta: { lastUpdated: '2026-10-01T12:00:00Z' } } },
] }

describe('statement form', () => {
  it('uses a fixed coded adherence reason dropdown with every choice available rather than filtered autocomplete', () => {
    const html = renderToStaticMarkup(<MedicationStatementForm value={{ ...initialStatementForm(), adherence: 'not-taking', adherenceReason: '182872003' }} data={data} disabled={false} onChange={() => {}} />)
    expect(html).not.toContain('<datalist')
    expect(html).toContain('Adherence reason<select')
    expect(html).toContain('<option value="182872003" selected="">Stopped taking medication because of cost</option>')
    for (const reason of ADHERENCE_REASONS) expect(html).toContain(`value="${reason.code}"`)
    expect(html).toContain('None selected')
    expect(html).toContain(`<option value="${OTHER_ADHERENCE_REASON}">Other</option>`)
    expect(html).not.toContain('Other adherence reason')
  })
  it('shows a separate text field only when Other is selected', () => {
    const html = renderToStaticMarkup(<MedicationStatementForm value={{ ...initialStatementForm(), adherence: 'taking', adherenceReason: OTHER_ADHERENCE_REASON, adherenceReasonText: 'My explanation' }} data={data} disabled={false} onChange={() => {}} />)
    expect(html).toContain('Other adherence reason<input')
    expect(html).toContain('value="My explanation"')
    expect(html).not.toContain('<datalist')
  })
  it('places basedOn first and uses the standard dated transfer list for reasons', () => {
    const html = renderToStaticMarkup(<MedicationStatementForm value={initialStatementForm()} data={data} disabled={false} onChange={() => {}} />)
    expect(html.indexOf('Based on MedicationRequest')).toBeLessThan(html.indexOf('<legend>Medication</legend>'))
    expect(html).toContain('empagliflozin 10 MG Oral Tablet [Jardiance]')
    expect(html).toContain('Reason references')
    expect(html).toContain('transfer-list-columns')
    expect(html).toContain('Condition: Indication')
    expect(html).toContain('Last updated')
    expect(html).not.toContain('Reason code')
    expect(html).not.toContain('Free text medication')
  })
  it('locks medication, reviews all copied dosage fields, and restores dosage editing when unset', () => {
    const selected = selectStatementRequest(initialStatementForm(), 'MedicationRequest/r', data)
    const html = renderToStaticMarkup(<MedicationStatementForm value={selected} data={data} disabled={false} onChange={() => {}} />)
    expect(html).toContain('<fieldset disabled="" class="device-form-fields"><div class="field-group"><label>Medication')
    expect(html).toContain('First instruction')
    expect(html).toContain('Second instruction')
    expect(html).toContain('Max Dose Per Lifetime')
    expect(html).toContain('fri')
    expect(html).not.toContain('Add dosage')
    const cleared = renderToStaticMarkup(<MedicationStatementForm value={selectStatementRequest(selected, '', data)} data={data} disabled={false} onChange={() => {}} />)
    expect(cleared).toContain('Add dosage')
    expect(cleared).toContain('First instruction')
    expect(cleared).toContain('Max Dose Per Lifetime')
  })
})
