import { describe, expect, it } from 'vitest'
import {
  addOneYearToDateValue,
  getPatientJurisdiction,
  getPmoSubmissionError,
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
})
