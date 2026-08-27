import type { CodeableConcept, Patient } from 'fhir/r4'

export function toIsoDateTimeLocalValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toUtcMidnightIso(dateValue: string) {
  return `${dateValue}T00:00:00.000Z`
}

export function addOneYearToDateValue(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00Z`)
  date.setUTCFullYear(date.getUTCFullYear() + 1)
  return toIsoDateTimeLocalValue(date)
}

export function getPatientJurisdiction(patient: Patient): CodeableConcept | undefined {
  const address = patient.address?.find((item) => item.country?.trim() && item.state?.trim())
  if (!address) return undefined
  const country = address.country?.trim().toUpperCase()
  const state = address.state?.trim().toUpperCase()
  if (!country || !state) return undefined
  return { coding: [{ system: 'urn:iso:std:iso:3166:-2', code: `${country}-${state}` }], text: `${country}-${state}` }
}

export function getPmoSubmissionError(input: { hasAuthor: boolean; hasAttester: boolean; hasAuthenticator: boolean; hasPdf: boolean }) {
  if (!input.hasAuthor) return 'Please select an author.'
  if (!input.hasAttester) return 'Please select an attester.'
  if (!input.hasAuthenticator) return 'Please select an authenticator.'
  if (!input.hasPdf) return 'Please upload a PDF source form.'
  return null
}
