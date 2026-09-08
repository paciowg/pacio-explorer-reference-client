/** Verifies clinical-summary filtering, ordering, formatting, and list limits. */
import { describe, expect, it } from 'vitest'
import type { Bundle } from 'fhir/r4'
import type { ClinicalListItem } from '../../components/clinicalTypes'
import { buildClinicalSummary } from './clinicalSummary'

function presentationOnly(items: ClinicalListItem[]) {
  return items.map(({ resource: _resource, details: _details, ...item }) => item)
}

describe('buildClinicalSummary', () => {
  it('extracts medications, allergies, and latest vital signs', () => {
    const bundle = {
      resourceType: 'Bundle', type: 'searchset', entry: [
        { resource: { resourceType: 'MedicationStatement', id: 'medication', status: 'active', medicationCodeableConcept: { text: 'Aspirin' }, dateAsserted: '2025-01-02' } },
        { resource: { resourceType: 'MedicationStatement', id: 'stopped', status: 'stopped', medicationCodeableConcept: { text: 'Stopped medication' } } },
        { resource: { resourceType: 'AllergyIntolerance', id: 'allergy', code: { text: 'Peanuts' }, type: 'allergy', category: ['food'], lastOccurrence: '2025-01-03' } },
        { resource: { resourceType: 'AllergyIntolerance', id: 'error', code: { text: 'Incorrect' }, verificationStatus: { coding: [{ code: 'entered-in-error' }] } } },
        { resource: { resourceType: 'Observation', id: 'older-rate', status: 'final', code: { coding: [{ code: '8867-4' }] }, effectiveDateTime: '2025-01-01', valueQuantity: { value: 60, unit: '/min' } } },
        { resource: { resourceType: 'Observation', id: 'newer-rate', status: 'amended', code: { coding: [{ code: '8867-4' }] }, effectiveDateTime: '2025-01-04', valueQuantity: { value: 72, unit: '/min' } } },
        { resource: { resourceType: 'Observation', id: 'blood-pressure', status: 'final', code: { coding: [{ code: '85354-9' }] }, effectiveDateTime: '2025-01-05', component: [
          { code: { coding: [{ code: '8480-6' }] }, valueQuantity: { value: 120, unit: 'mmHg' } },
          { code: { coding: [{ code: '8462-4' }] }, valueQuantity: { value: 80, unit: 'mmHg' } },
        ] } },
      ],
    } as unknown as Bundle

    const model = buildClinicalSummary(bundle)
    expect(presentationOnly(model.currentMedications)).toEqual([
      { title: 'Aspirin', dateLabel: 'Recorded', dateValue: '2025-01-02' },
    ])
    expect(presentationOnly(model.knownAllergies)).toEqual([{
      title: 'Peanuts', secondaryText: 'Food allergy',
      dateLabel: 'Last occurrence', dateValue: '2025-01-03',
    }])
    expect(model.mostRecentVitals.map((item) => [item.title, item.secondaryText])).toEqual([
      ['Blood pressure', '120/80 mmHg'],
      ['Heart rate', '72 /min'],
    ])
    expect(model.mostRecentVitals[0].resource?.id).toBe('blood-pressure')
    expect(model.mostRecentVitals[0].details?.groups.map((group) => group.title))
      .toEqual([undefined, '8480-6', '8462-4'])
  })

  it('sorts and limits clinical lists and truncates directive descriptions', () => {
    const conditions = Array.from({ length: 12 }, (_, index) => ({
      resource: {
        resourceType: 'Condition' as const,
        id: `condition-${index}`,
        clinicalStatus: { coding: [{ code: 'active' }] },
        code: { text: `Condition ${index}` },
        onsetDateTime: `2025-01-${String(index + 1).padStart(2, '0')}`,
      },
    }))
    const longDescription = 'A'.repeat(130)
    const model = buildClinicalSummary({
      resourceType: 'Bundle', type: 'searchset', entry: [
        ...conditions,
        { resource: { resourceType: 'DocumentReference', id: 'directive', status: 'current', category: [{ coding: [{ code: '42348-3' }] }], type: { text: 'Directive' }, description: longDescription, content: [] } },
      ],
    } as unknown as Bundle)

    expect(model.activeProblems).toHaveLength(10)
    expect(model.activeProblems[0].title).toBe('Condition 11')
    expect(model.activeProblems[9].title).toBe('Condition 2')
    expect(model.advanceDirectives[0].secondaryText).toHaveLength(120)
    expect(model.advanceDirectives[0].secondaryText?.endsWith('...')).toBe(true)
  })

  it('uses shared resource display fallbacks without changing clinical metadata', () => {
    const model = buildClinicalSummary({
      resourceType: 'Bundle', type: 'searchset', entry: [
        { resource: { resourceType: 'Condition', id: 'condition-without-code', onsetDateTime: '2025-02-01' } },
        { resource: { resourceType: 'MedicationStatement', id: 'referenced-medication', status: 'active', medicationReference: { reference: 'Medication/aspirin', display: 'Aspirin tablet' }, dateAsserted: '2025-02-02' } },
        { resource: { resourceType: 'AllergyIntolerance', id: 'allergy-without-code', recordedDate: '2025-02-03' } },
      ],
    } as unknown as Bundle)

    expect(presentationOnly(model.activeProblems)).toEqual([{
      title: 'Condition/condition-without-code', dateLabel: 'Onset', dateValue: '2025-02-01',
    }])
    expect(presentationOnly(model.currentMedications)).toEqual([{
      title: 'Aspirin tablet', dateLabel: 'Recorded', dateValue: '2025-02-02',
    }])
    expect(presentationOnly(model.knownAllergies)).toEqual([{
      title: 'AllergyIntolerance/allergy-without-code', dateLabel: 'Recorded', dateValue: '2025-02-03',
    }])
    expect(model.activeProblems[0].details).toBeNull()
  })

  it('attaches shared expansion details to Patient clinical resources but not document links', () => {
    const note = 'The ulcer has erythema, edema, drainage, and a foul odor.'
    const model = buildClinicalSummary({
      resourceType: 'Bundle', type: 'searchset', entry: [
        { resource: {
          resourceType: 'Condition', id: 'ulcer', clinicalStatus: { coding: [{ code: 'active' }] },
          code: { text: 'Infected ulcer of skin' }, bodySite: [{ text: 'Right hip' }],
          recordedDate: '2026-07-14', note: [{ text: note }],
        } },
        { resource: {
          resourceType: 'DocumentReference', id: 'directive', status: 'current',
          category: [{ coding: [{ code: '42348-3' }] }], type: { text: 'Directive' }, content: [],
        } },
        { resource: {
          resourceType: 'DocumentReference', id: 'toc', status: 'current',
          type: { coding: [{ code: '18761-7' }] }, content: [],
        } },
      ],
    } as unknown as Bundle)

    const fields = model.activeProblems[0].details?.groups.flatMap((group) => group.fields)
    expect(model.activeProblems[0].resource?.id).toBe('ulcer')
    expect(fields?.find((field) => field.label === 'Body site')?.values).toEqual(['Right hip'])
    expect(fields?.find((field) => field.label === 'Notes')?.values).toEqual([note])
    expect(model.advanceDirectives[0].resource).toBeUndefined()
    expect(model.transitionOfCares[0].resource).toBeUndefined()
  })

  it('resolves Patient detail references against the loaded Bundle', () => {
    const model = buildClinicalSummary({
      resourceType: 'Bundle', type: 'searchset', entry: [
        { resource: {
          resourceType: 'MedicationStatement', id: 'statement', status: 'active',
          medicationReference: { reference: 'Medication/aspirin' },
        } },
        { resource: {
          resourceType: 'Medication', id: 'aspirin', code: { text: 'Aspirin tablet' },
        } },
      ],
    } as unknown as Bundle)

    const medication = model.currentMedications[0].details?.groups
      .flatMap((group) => group.fields)
      .find((field) => field.label === 'Medication')
    expect(medication?.values).toEqual(['Aspirin tablet'])
  })
})
