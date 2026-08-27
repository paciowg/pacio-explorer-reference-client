import { describe, expect, it } from 'vitest'
import { buildPatientSummaryModel } from './patientSummaryModel'

describe('buildPatientSummaryModel', () => {
  it('uses patient-only fallback values when $everything is unavailable', () => {
    const model = buildPatientSummaryModel({
      patient: { resourceType: 'Patient', id: 'patient-1', name: [{ given: ['Ada'], family: 'Lovelace' }] },
      bundle: null,
      bundleAvailable: false,
    })

    expect(model.patientName).toBe('Ada Lovelace')
    expect(model.bundleStatusText).toBe('Showing patient-only fallback data')
    expect(model.clinicalSectionEmptyMessage).toBe('Unavailable')
    expect(model.activeProblems).toEqual([])
    expect(model.advanceDirectives).toEqual([])
  })

  it('extracts and orders supported clinical resources, excluding unsupported directives', () => {
    const model = buildPatientSummaryModel({
      patient: { resourceType: 'Patient', id: 'patient-1' },
      bundleAvailable: true,
      bundle: {
        resourceType: 'Bundle', type: 'searchset', entry: [
          { resource: { resourceType: 'Condition', id: 'inactive', clinicalStatus: { coding: [{ code: 'inactive' }] }, code: { text: 'Old condition' } } },
          { resource: { resourceType: 'Condition', id: 'active', clinicalStatus: { coding: [{ code: 'active' }] }, code: { text: 'Current condition' }, onsetDateTime: '2025-01-02' } },
          { resource: { resourceType: 'DocumentReference', id: 'not-adi', status: 'current', type: { text: 'Other' }, content: [] } },
          { resource: { resourceType: 'DocumentReference', id: 'adi', status: 'current', type: { text: 'Portable medical order form' }, category: [{ coding: [{ code: '42348-3' }] }], date: '2025-01-03', description: 'Advance directive', content: [] } },
        ],
      } as unknown as import('fhir/r4').Bundle,
    })

    expect(model.bundleStatusText).toBe('')
    expect(model.activeProblems).toEqual([{ title: 'Current condition', dateLabel: 'Onset', dateValue: '2025-01-02' }])
    expect(model.advanceDirectives).toEqual([{
      id: 'adi', title: 'Portable medical order form', dateLabel: 'Date', dateValue: '2025-01-03', secondaryText: 'Advance directive',
    }])
  })
})
