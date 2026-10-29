/** Verifies request locking, lossless dosage copying, medication restrictions, and authored date/adherence payloads. */
import type { MedicationRequest } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { ADHERENCE_CODES, buildSmpMedicationStatement, catalogMedication, MEDICATION_CATALOG, OTHER_ADHERENCE_REASON, SMP_ADHERENCE, SMP_STATEMENT } from '../../igs/pacioSmp/medicationStatement'
import { initialStatementForm, selectStatementRequest, statementFormInputs } from './statementFormModel'
import type { StatementCreateData } from './statementCreateData'

const request: MedicationRequest = { resourceType: 'MedicationRequest', id: 'r', status: 'active', intent: 'order', subject: { reference: 'Patient/p' },
  medicationCodeableConcept: catalogMedication('313782'), dosageInstruction: [{ text: 'Instructions from request', sequence: 2,
    timing: { repeat: { dayOfWeek: ['mon', 'fri'], boundsPeriod: { start: '2026-01-02T08:00:00-05:00' } } },
    doseAndRate: [{ doseRange: { low: { value: 1 }, high: { value: 2 } }, rateRatio: { numerator: { value: 1 }, denominator: { value: 2 } } }],
    maxDosePerLifetime: { value: 10 }, extension: [{ url: 'https://example.test/original', valueString: 'Preserve me' }] }] }
const data: StatementCreateData = { patient: { resourceType: 'Patient', id: 'p' }, warning: '', options: [
  { reference: 'MedicationRequest/r', resource: request, display: 'Request', label: 'MedicationRequest: Request' },
  { reference: 'Condition/c', resource: { resourceType: 'Condition', id: 'c' }, display: 'Indication', label: 'Condition: Indication' },
], requests: [{ reference: 'MedicationRequest/r', resource: request, display: 'Request', label: 'MedicationRequest: Request', medication: { medicationCodeableConcept: request.medicationCodeableConcept } }] }
const form = () => ({ ...initialStatementForm(), status: 'active' as const, medication: { medicationCodeableConcept: catalogMedication('313782') } })

describe('statement inputs', () => {
  it('uses the 20 distinct supplied products without preset clinical assertions', () => {
    expect(MEDICATION_CATALOG).toHaveLength(20)
    expect(new Set(MEDICATION_CATALOG.map(([code]) => code)).size).toBe(20)
    expect(initialStatementForm()).toMatchObject({ medication: {}, dosage: [], status: '', adherence: '', informationSource: '' })
    expect(catalogMedication('1545664').coding?.[0].display).toContain('[Jardiance]')
    expect(() => catalogMedication('made-up')).toThrow('sample catalog')
  })
  it('copies all medication/dosage fields, treats the request as authoritative, and unlocks without discarding values', () => {
    const selected = selectStatementRequest(form(), 'MedicationRequest/r', data)
    expect(selected.dosage).toEqual(request.dosageInstruction)
    expect(selected.dosage).not.toBe(request.dosageInstruction)
    const payload = statementFormInputs({ ...selected, medication: {}, dosage: [] }, data)
    expect(payload.medicationCodeableConcept).toEqual(request.medicationCodeableConcept)
    expect(payload.dosage).toEqual(request.dosageInstruction)
    const cleared = selectStatementRequest(selected, '', data)
    expect(cleared.basedOn).toBe('')
    expect(cleared.dosage).toEqual(selected.dosage)
    expect(statementFormInputs(cleared, data).basedOn).toBeUndefined()
    expect(statementFormInputs(cleared, data).dosage).toEqual(request.dosageInstruction)
    selected.dosage[0].text = 'Edited locally'
    expect(request.dosageInstruction?.[0].text).toBe('Instructions from request')
  })
  it('does not fabricate dosage when the chosen request has none', () => {
    const withoutDosage = { ...data, requests: [{ ...data.requests[0], resource: { ...request, dosageInstruction: undefined } }] }
    expect(statementFormInputs(selectStatementRequest(form(), 'MedicationRequest/r', withoutDosage), withoutDosage).dosage).toBeUndefined()
  })
  it('serializes date-only inputs, optional adherence, reason references, and standalone clock times', () => {
    const fields = statementFormInputs({ ...form(), dateAsserted: '2026-10-28', effectiveKind: 'period', effectiveStart: '2026-10-01',
      effectiveEnd: '', adherence: 'not-taking', adherenceReason: '182872003', reasonReferences: ['Condition/c'],
      dosage: [{ text: 'Reported instructions', timing: { repeat: { frequency: 1, period: 1, periodUnit: 'd', timeOfDay: ['08:30'] } }, asNeededBoolean: false }] }, data)
    const statement = buildSmpMedicationStatement({ ...fields, subject: { reference: 'Patient/p' } })
    expect(statement.meta?.profile).toEqual([SMP_STATEMENT])
    expect(statement.effectivePeriod).toEqual({ start: '2026-10-01' })
    expect(statement.dateAsserted).toBe('2026-10-28')
    expect(statement.dosage?.[0].timing?.repeat?.timeOfDay).toEqual(['08:30:00'])
    expect(statement.dosage?.[0].asNeededBoolean).toBe(false)
    expect(statement.extension).toEqual([{ url: SMP_ADHERENCE, extension: [
      { url: 'code', valueCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/CodeSystem/medication-statement-adherence', code: 'not-taking', display: 'not taking' }] } },
      { url: 'reason', valueCodeableConcept: { coding: [{ system: 'http://snomed.info/sct', code: '182872003', display: 'Drug discontinued - too expensive' }] } },
    ] }])
    expect(statement.reasonReference).toEqual([{ reference: 'Condition/c', display: 'Indication' }])
    expect(statement.reasonCode).toBeUndefined()
  })
  it('permits every adherence value with active status and distinguishes omission from unknown', () => {
    for (const adherence of ADHERENCE_CODES) expect(() => statementFormInputs({ ...form(), adherence }, data)).not.toThrow()
    expect(buildSmpMedicationStatement({ ...statementFormInputs(form(), data), subject: { reference: 'Patient/p' } }).extension).toBeUndefined()
  })
  it('submits Other as text only, requires its explanation, and ignores inactive text for coded or absent reasons', () => {
    const fields = statementFormInputs({ ...form(), adherence: 'not-taking', adherenceReason: OTHER_ADHERENCE_REASON, adherenceReasonText: ' Custom explanation ' }, data)
    const statement = buildSmpMedicationStatement({ ...fields, subject: { reference: 'Patient/p' } })
    expect(statement.extension?.[0].extension?.[1]).toEqual({ url: 'reason', valueCodeableConcept: { text: 'Custom explanation' } })
    expect(JSON.stringify(statement)).not.toContain(OTHER_ADHERENCE_REASON)
    expect(statement).not.toHaveProperty('adherenceReasonText')
    expect(() => statementFormInputs({ ...form(), adherence: 'not-taking', adherenceReason: OTHER_ADHERENCE_REASON, adherenceReasonText: ' ' }, data)).toThrow('Enter an adherence reason for Other')
    for (const reason of ['182872003', '']) {
      const input = statementFormInputs({ ...form(), adherence: 'not-taking', adherenceReason: reason, adherenceReasonText: 'Ignore me' }, data)
      expect(JSON.stringify(buildSmpMedicationStatement({ ...input, subject: { reference: 'Patient/p' } }))).not.toContain('Ignore me')
    }
  })
  it('rejects uncoded/missing medication, stale choices, invalid dates, ranges, and schedules before publication', () => {
    expect(() => statementFormInputs({ ...form(), adherence: 'not-taking', adherenceReason: 'Cost' }, data)).toThrow('supported adherence reason')
    expect(() => statementFormInputs({ ...form(), medication: { medicationCodeableConcept: { text: 'Uncoded' } } }, data)).toThrow('coded medication')
    expect(() => statementFormInputs({ ...form(), medication: {} }, data)).toThrow('one medication')
    expect(() => statementFormInputs({ ...form(), reasonReferences: ['Condition/absent'] }, data)).toThrow('no longer available')
    expect(() => statementFormInputs({ ...form(), medication: { medicationReference: { reference: 'Medication/absent' } } }, data)).toThrow('no longer available')
    expect(() => statementFormInputs({ ...form(), basedOn: 'MedicationRequest/missing' }, data)).toThrow('unavailable')
    expect(() => statementFormInputs({ ...form(), dateAsserted: '2026-02-30' }, data)).toThrow('valid')
    expect(() => statementFormInputs({ ...form(), effectiveKind: 'period', effectiveStart: '2026-10-02', effectiveEnd: '2026-10-01' }, data)).toThrow('precede')
    expect(() => statementFormInputs({ ...form(), dosage: [{ timing: { repeat: { frequency: 0 } } }] }, data)).toThrow('positive')
    expect(() => statementFormInputs({ ...form(), dosage: [{ timing: { repeat: { timeOfDay: ['28:30'] } } }] }, data)).toThrow('clock times')
    expect(statementFormInputs({ ...form(), dosage: [{}] }, data).dosage).toBeUndefined()
  })
})
