/** Verifies clinically useful resource details, FHIR fallbacks, and supported resource coverage. */
import type { Condition, Resource } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { buildResourceDetailModel } from './resourceDetails'

function detailValues(resource: Resource, label: string) {
  return buildResourceDetailModel(resource)?.groups
    .flatMap((group) => group.fields)
    .find((detailField) => detailField.label === label)?.values
}

describe('buildResourceDetailModel', () => {
  it('includes the useful body site, dates, statuses, and complete note for a PACIO PFE Condition', () => {
    const condition: Condition = {
      resourceType: 'Condition',
      id: 'condition-1',
      meta: { profile: ['http://hl7.org/fhir/us/pacio-pfe/StructureDefinition/pfe-condition-encounter-diagnosis'] },
      extension: [{
        url: 'http://hl7.org/fhir/StructureDefinition/condition-assertedDate',
        valueDateTime: '2026-07-14',
      }],
      clinicalStatus: { coding: [{ code: 'active' }] },
      verificationStatus: { coding: [{ code: 'confirmed' }] },
      category: [{ coding: [{ code: 'encounter-diagnosis', display: 'Encounter Diagnosis' }] }],
      code: { text: 'Infected ulcer of skin' },
      bodySite: [{ coding: [{ code: '787204008', display: 'Structure of skin of right hip' }] }],
      subject: { reference: 'Patient/1' },
      recordedDate: '2026-07-14',
      note: [{ text: 'Full clinical note about the infected ulcer and surrounding skin.' }],
    }

    expect(detailValues(condition, 'Clinical status')).toEqual(['active'])
    expect(detailValues(condition, 'Verification status')).toEqual(['confirmed'])
    expect(detailValues(condition, 'Body site')).toEqual(['Structure of skin of right hip'])
    expect(detailValues(condition, 'Asserted date')).toEqual(['2026-07-14'])
    expect(detailValues(condition, 'Recorded date')).toEqual(['2026-07-14'])
    expect(detailValues(condition, 'Notes')).toEqual([
      'Full clinical note about the infected ulcer and surrounding skin.',
    ])
  })

  it.each([
    ['AllergyIntolerance', { clinicalStatus: { text: 'Active' } }],
    ['Observation', { status: 'final', code: { text: 'Heart rate' } }],
    ['DiagnosticReport', { status: 'final', code: { text: 'Lab report' } }],
    ['Procedure', { status: 'completed', subject: { reference: 'Patient/1' } }],
    ['ServiceRequest', { status: 'active', intent: 'order', subject: { reference: 'Patient/1' } }],
    ['Immunization', { status: 'completed', vaccineCode: { text: 'Influenza' }, patient: { reference: 'Patient/1' }, occurrenceDateTime: '2026-01-01' }],
    ['Medication', { status: 'active', code: { text: 'Medication' } }],
    ['MedicationRequest', { status: 'active', intent: 'order', subject: { reference: 'Patient/1' }, medicationCodeableConcept: { text: 'Medication' } }],
    ['MedicationStatement', { status: 'active', subject: { reference: 'Patient/1' }, medicationCodeableConcept: { text: 'Medication' } }],
    ['List', { status: 'current', mode: 'working', title: 'Medication list' }],
    ['CarePlan', { status: 'active', intent: 'plan', subject: { reference: 'Patient/1' } }],
    ['Goal', { lifecycleStatus: 'active', description: { text: 'Walk independently' }, subject: { reference: 'Patient/1' } }],
    ['Device', { status: 'active' }],
    ['DeviceRequest', { status: 'active', intent: 'order', subject: { reference: 'Patient/1' }, codeCodeableConcept: { text: 'Wheelchair' } }],
    ['Encounter', { status: 'finished', class: { code: 'IMP' } }],
    ['QuestionnaireResponse', { status: 'completed' }],
    ['DocumentReference', { status: 'current', content: [] }],
    ['Composition', { status: 'final', type: { text: 'Transfer Summary' }, date: '2026-01-01', author: [], title: 'TOC' }],
  ])('provides a detail model for %s', (resourceType, fields) => {
    const resource = { resourceType, id: 'example', ...fields } as Resource
    expect(buildResourceDetailModel(resource)).not.toBeNull()
  })

  it('does not offer expansion for an unsupported resource', () => {
    expect(buildResourceDetailModel({ resourceType: 'Basic', id: 'basic-1' } as Resource)).toBeNull()
  })

  it('uses Bundle-resolved labels for references and does not require transport access', () => {
    const procedure = {
      resourceType: 'Procedure', id: 'procedure-1', status: 'completed',
      subject: { reference: 'Patient/1' }, reasonReference: [{ reference: 'urn:uuid:condition' }],
    } as Resource
    const resolved = {
      resourceType: 'Condition', id: 'condition-1', subject: { reference: 'Patient/1' },
      code: { text: 'Underlying condition' },
    } as Resource
    const detailModel = buildResourceDetailModel(procedure, (reference) =>
      reference === 'urn:uuid:condition' ? resolved : undefined)
    expect(detailModel?.groups[0].fields.find((item) => item.label === 'Reason')?.values)
      .toEqual(['Underlying condition'])
  })
})
