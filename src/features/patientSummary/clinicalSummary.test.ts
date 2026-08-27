import { describe, expect, it } from 'vitest'
import type { Bundle } from 'fhir/r4'
import { buildClinicalSummary } from './clinicalSummary'

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
    expect(model.currentMedications).toEqual([
      { title: 'Aspirin', dateLabel: 'Recorded', dateValue: '2025-01-02' },
    ])
    expect(model.knownAllergies).toEqual([{
      title: 'Peanuts', secondaryText: 'Food allergy',
      dateLabel: 'Last occurrence', dateValue: '2025-01-03',
    }])
    expect(model.mostRecentVitals.map((item) => [item.title, item.secondaryText])).toEqual([
      ['Blood pressure', '120/80 mmHg'],
      ['Heart rate', '72 /min'],
    ])
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
})
