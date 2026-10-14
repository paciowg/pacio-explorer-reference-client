/** Converts FHIR participants into PMO form options and submission values using shared practitioner choice derivation. */
import type {
  Bundle,
  CodeableConcept,
  Patient,
  Practitioner,
  Reference,
  RelatedPerson,
  Resource,
} from 'fhir/r4'
import { getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import { formatResourceSelectionLabel, getResourceSelectionDisplay, type PractitionerRoleOption } from '../../lib/fhir/resourceOptions'
import type { PmoAttesterOption, PmoDataEntererOption } from '../../igs/pacioAdi/pmoDocument'
import { calendarDateValue } from '../../lib/dateTime'

export type PmoAttesterChoice = PmoAttesterOption & { label: string }
export type PmoDataEntererChoice = PmoDataEntererOption & { label: string }

export type FacilitatorOption = {
  value: string
  label: string
  reference: Reference
}

export function addOneYearToDateValue(dateValue: string) {
  if (!dateValue) return ''
  calendarDateValue(dateValue)
  const date = new Date(`${dateValue}T00:00:00Z`)
  // Preserve the calendar day when the following year has no February 29.
  if (date.getUTCMonth() === 1 && date.getUTCDate() === 29) date.setUTCDate(28)
  date.setUTCFullYear(date.getUTCFullYear() + 1)
  return date.toISOString().slice(0, 10)
}

export function getPatientJurisdiction(patient: Patient): CodeableConcept | undefined {
  // ADI jurisdiction uses an ISO 3166-2 subdivision only when both address parts are available.
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

export function getAuthenticatorOptions(roleOptions: PractitionerRoleOption[]) {
  return roleOptions.map((roleOption) => ({
    value: `PractitionerRole/${roleOption.role.id}`,
    label: roleOption.label,
    reference: {
      reference: `PractitionerRole/${roleOption.role.id}`,
      display: roleOption.label,
    },
  }))
}

export function getFacilitatorOptions(
  roleOptions: PractitionerRoleOption[],
): FacilitatorOption[] {
  return roleOptions.map((roleOption) => ({
    value: `PractitionerRole/${roleOption.role.id}`,
    label: roleOption.label,
    reference: {
      reference: `PractitionerRole/${roleOption.role.id}`,
      display: roleOption.label,
    },
  }))
}

export function getRelatedPersons(bundle: Bundle): RelatedPerson[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is RelatedPerson => resource?.resourceType === 'RelatedPerson')
    .filter((relatedPerson) => Boolean(relatedPerson.id))
    .sort((a, b) => {
      const aName = getDisplayNameFromHumanName(a.name?.[0]) || a.id || ''
      const bName = getDisplayNameFromHumanName(b.name?.[0]) || b.id || ''
      return aName.localeCompare(bName)
    })
}

function participantChoice(resource: Resource, display = getResourceSelectionDisplay(resource)): PmoAttesterChoice {
  return { reference: `${resource.resourceType}/${resource.id}`, display,
    label: formatResourceSelectionLabel(resource.resourceType, display) }
}

export function getAttesterOptions(
  patient: Patient | null,
  roleOptions: PractitionerRoleOption[],
  relatedPersons: RelatedPerson[],
) {
  const options: PmoAttesterChoice[] = []
  if (patient?.id) {
    options.push(participantChoice(patient))
  }
  for (const relatedPerson of relatedPersons) {
    if (!relatedPerson.id) continue
    options.push(participantChoice(relatedPerson))
  }
  for (const roleOption of roleOptions) {
    options.push(participantChoice(roleOption.role, roleOption.label))
  }
  return options
}

export function getDataEntererOptions(
  patient: Patient | null,
  roleOptions: PractitionerRoleOption[],
  unpairedPractitioners: Map<string, Practitioner>,
  relatedPersons: RelatedPerson[],
): PmoDataEntererChoice[] {
  const options = getAttesterOptions(patient, roleOptions, relatedPersons)
  for (const practitioner of unpairedPractitioners.values()) {
    options.push(participantChoice(practitioner))
  }
  return options
}
