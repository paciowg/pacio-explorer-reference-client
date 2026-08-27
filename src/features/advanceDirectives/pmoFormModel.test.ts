/** Verifies PMO form option derivation, date conversion, jurisdiction, and validation rules. */
import { describe, expect, it } from 'vitest'
import {
  addOneYearToDateValue,
  getPatientJurisdiction,
  getAttesterOptions,
  getDataEntererOptions,
  getPmoSubmissionError,
  getPractitionerMap,
  getPractitionerRoleOptions,
  toUtcMidnightIso,
} from './pmoFormModel'

describe('PMO form model', () => {
  it('derives UTC dates and jurisdiction without browser dependencies', () => {
    expect(toUtcMidnightIso('2025-01-02')).toBe('2025-01-02T00:00:00.000Z')
    expect(addOneYearToDateValue('2024-02-29')).toBe('2025-02-28')
    expect(getPatientJurisdiction({
      resourceType: 'Patient', address: [{ country: ' us ', state: ' ma ' }],
    })).toEqual({
      coding: [{ system: 'urn:iso:std:iso:3166:-2', code: 'US-MA' }], text: 'US-MA',
    })
  })

  it('retains the form validation messages', () => {
    expect(getPmoSubmissionError({ hasAuthor: false, hasAttester: true, hasAuthenticator: true, hasPdf: true })).toBe('Please select an author.')
    expect(getPmoSubmissionError({ hasAuthor: true, hasAttester: true, hasAuthenticator: true, hasPdf: false })).toBe('Please upload a PDF source form.')
  })

  it('derives sorted role, attester, and data-enterer options', () => {
    const bundle = {
      resourceType: 'Bundle' as const,
      type: 'searchset' as const,
      entry: [
        { resource: { resourceType: 'Practitioner' as const, id: 'practitioner-1', name: [{ text: 'Dr. Author' }] } },
        { resource: { resourceType: 'Practitioner' as const, id: 'practitioner-2', name: [{ text: 'Unassigned Practitioner' }] } },
        { resource: { resourceType: 'PractitionerRole' as const, id: 'role-1', practitioner: { reference: 'Practitioner/practitioner-1' }, code: [{ text: 'Physician' }] } },
      ],
    }
    const practitioners = getPractitionerMap(bundle)
    const roles = getPractitionerRoleOptions(bundle, practitioners)
    const patient = { resourceType: 'Patient' as const, id: 'patient-1', name: [{ text: 'Patient Person' }] }
    const relatedPersons = [{ resourceType: 'RelatedPerson' as const, id: 'related-1', patient: { reference: 'Patient/patient-1' }, name: [{ text: 'Related Person' }] }]

    expect(roles.map((option) => option.label)).toEqual(['Dr. Author — Physician'])
    expect(getAttesterOptions(patient, roles, relatedPersons).map((option) => option.reference)).toEqual([
      'Patient/patient-1', 'RelatedPerson/related-1', 'PractitionerRole/role-1',
    ])
    expect(getDataEntererOptions(patient, roles, practitioners, relatedPersons).map((option) => option.reference)).toEqual([
      'Patient/patient-1', 'RelatedPerson/related-1', 'PractitionerRole/role-1', 'Practitioner/practitioner-2',
    ])
  })
})
