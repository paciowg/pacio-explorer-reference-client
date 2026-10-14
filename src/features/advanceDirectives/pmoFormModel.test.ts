/** Verifies PMO form option derivation, date conversion, jurisdiction, and validation rules. */
import { describe, expect, it } from 'vitest'
import {
  addOneYearToDateValue,
  getPatientJurisdiction,
  getAttesterOptions,
  getDataEntererOptions,
  getPmoSubmissionError,
} from './pmoFormModel'
import { getPractitionerChoices } from '../../lib/fhir/resourceOptions'

describe('PMO form model', () => {
  it('derives calendar dates and jurisdiction without browser dependencies', () => {
    expect(addOneYearToDateValue('2024-02-29')).toBe('2025-02-28')
    expect(addOneYearToDateValue('2025-01-02')).toBe('2026-01-02')
    expect(addOneYearToDateValue('')).toBe('')
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
    const { roleOptions: roles, unpairedPractitioners } = getPractitionerChoices(bundle, 'https://source.test/fhir')
    const patient = { resourceType: 'Patient' as const, id: 'patient-1', name: [{ text: 'Patient Person' }] }
    const relatedPersons = [{ resourceType: 'RelatedPerson' as const, id: 'related-1', patient: { reference: 'Patient/patient-1' }, name: [{ text: 'Related Person' }] }]

    expect(roles.map((option) => option.label)).toEqual(['Dr. Author — Physician'])
    expect(getAttesterOptions(patient, roles, relatedPersons).map((option) => option.reference)).toEqual([
      'Patient/patient-1', 'RelatedPerson/related-1', 'PractitionerRole/role-1',
    ])
    expect(getAttesterOptions(patient, roles, relatedPersons).map((option) => [option.label, option.display])).toEqual([
      ['Patient: Patient Person', 'Patient Person'],
      ['RelatedPerson: Related Person', 'Related Person'],
      ['PractitionerRole: Dr. Author — Physician', 'Dr. Author — Physician'],
    ])
    expect(getDataEntererOptions(patient, roles, unpairedPractitioners, relatedPersons).map((option) => option.reference)).toEqual([
      'Patient/patient-1', 'RelatedPerson/related-1', 'PractitionerRole/role-1', 'Practitioner/practitioner-2',
    ])
  })

  it('uses shared role matching for absolute and versioned PMO data-enterer references', () => {
    const bundle = {
      resourceType: 'Bundle' as const, type: 'collection' as const, entry: [
        { resource: { resourceType: 'Practitioner' as const, id: 'paired', name: [{ text: 'Alex Smith' }] } },
        { resource: { resourceType: 'Practitioner' as const, id: 'standalone', name: [{ text: 'Jamie Jones' }] } },
        { resource: { resourceType: 'PractitionerRole' as const, id: 'physician', practitioner: { reference: 'https://source.test/fhir/Practitioner/paired/_history/2' }, code: [{ text: 'Physician' }] } },
      ],
    }
    const { roleOptions, unpairedPractitioners } = getPractitionerChoices(bundle, 'https://source.test/fhir')
    expect(getDataEntererOptions(null, roleOptions, unpairedPractitioners, [])).toEqual([
      { reference: 'PractitionerRole/physician', label: 'PractitionerRole: Alex Smith — Physician', display: 'Alex Smith — Physician' },
      { reference: 'Practitioner/standalone', label: 'Practitioner: Jamie Jones', display: 'Jamie Jones' },
    ])
  })
  it('separates related-person labels from reference displays and does not substitute the patient name', () => {
    const persons = [
      { resourceType: 'RelatedPerson' as const, id: 'son', patient: { reference: 'Patient/p', display: 'Betsy Johnson' }, name: [{ text: 'Charles Johnson' }], relationship: [{ text: 'son' }] },
      { resourceType: 'RelatedPerson' as const, id: 'unnamed', patient: { reference: 'Patient/p', display: 'Betsy Johnson' } },
    ]
    expect(getAttesterOptions(null, [], persons)).toEqual([
      { reference: 'RelatedPerson/son', label: 'RelatedPerson: Charles Johnson — son', display: 'Charles Johnson — son' },
      { reference: 'RelatedPerson/unnamed', label: 'RelatedPerson: unnamed', display: 'unnamed' },
    ])
  })
})
