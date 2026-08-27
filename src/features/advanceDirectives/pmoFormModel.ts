import type {
  Bundle,
  CodeableConcept,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
  Reference,
  RelatedPerson,
  Resource,
} from 'fhir/r4'
import {
  getCodeableConceptText,
  getDisplayNameFromHumanName,
  getPractitionerDisplayName,
  getPractitionerRoleDisplayName,
} from '../../lib/fhir/formatters'
import type { PmoAttesterOption, PmoDataEntererOption } from '../../igs/pacioAdi/pmoDocument'

export type PractitionerRoleOption = {
  value: string
  label: string
  role: PractitionerRole
}

export type OrganizationOption = {
  value: string
  label: string
  organization: Organization
}

export type FacilitatorOption = {
  value: string
  label: string
  reference: Reference
}

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

export function getPractitionerMap(bundle: Bundle) {
  const map = new Map<string, Practitioner>()
  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource
    if (!isPractitioner(resource) || !resource.id) continue
    map.set(`Practitioner/${resource.id}`, resource)
  }
  return map
}

function isPractitioner(resource: Resource | undefined): resource is Practitioner {
  return resource?.resourceType === 'Practitioner'
}

export function getPractitionerRoleOptions(
  bundle: Bundle,
  practitionerByReference: Map<string, Practitioner>,
) {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is PractitionerRole => resource?.resourceType === 'PractitionerRole')
    .filter((role) => Boolean(role.id))
    .map((role) => ({
      value: role.id!,
      label: getPractitionerRoleDisplayName(role, practitionerByReference),
      role,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
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

function getOrganizationDisplayName(organization: Organization) {
  return organization.name || organization.alias?.find(Boolean) || organization.id || 'Organization'
}

export function getOrganizationOptions(bundle: Bundle): OrganizationOption[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is Organization => resource?.resourceType === 'Organization')
    .filter((organization) => Boolean(organization.id))
    .map((organization) => ({
      value: organization.id!,
      label: getOrganizationDisplayName(organization),
      organization,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
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

function getRelatedPersonDisplayName(relatedPerson: RelatedPerson) {
  const name = getDisplayNameFromHumanName(relatedPerson.name?.[0]) ||
    relatedPerson.patient?.display || relatedPerson.id || 'Related person'
  const relationship = relatedPerson.relationship?.length
    ? getCodeableConceptText(relatedPerson.relationship[0])
    : ''
  return relationship ? `${name} — RelatedPerson (${relationship})` : `${name} — RelatedPerson`
}

export function getAttesterOptions(
  patient: Patient | null,
  roleOptions: PractitionerRoleOption[],
  relatedPersons: RelatedPerson[],
) {
  const options: PmoAttesterOption[] = []
  if (patient?.id) {
    options.push({
      reference: `Patient/${patient.id}`,
      display: `${getDisplayNameFromHumanName(patient.name?.[0]) || patient.id || 'Patient'} — Patient`,
    })
  }
  for (const relatedPerson of relatedPersons) {
    if (!relatedPerson.id) continue
    options.push({
      reference: `RelatedPerson/${relatedPerson.id}`,
      display: getRelatedPersonDisplayName(relatedPerson),
    })
  }
  for (const roleOption of roleOptions) {
    options.push({
      reference: `PractitionerRole/${roleOption.role.id}`,
      display: roleOption.label,
    })
  }
  return options
}

export function getDataEntererOptions(
  patient: Patient | null,
  roleOptions: PractitionerRoleOption[],
  practitionerByReference: Map<string, Practitioner>,
  relatedPersons: RelatedPerson[],
): PmoDataEntererOption[] {
  const options: PmoDataEntererOption[] = []
  const practitionerReferencesCoveredByRole = new Set<string>()
  if (patient?.id) {
    options.push({
      reference: `Patient/${patient.id}`,
      display: `${getDisplayNameFromHumanName(patient.name?.[0]) || patient.id || 'Patient'} — Patient`,
    })
  }
  for (const relatedPerson of relatedPersons) {
    if (!relatedPerson.id) continue
    options.push({
      reference: `RelatedPerson/${relatedPerson.id}`,
      display: getRelatedPersonDisplayName(relatedPerson),
    })
  }
  for (const roleOption of roleOptions) {
    options.push({
      reference: `PractitionerRole/${roleOption.role.id}`,
      display: roleOption.label,
    })
    const practitionerReference = roleOption.role.practitioner?.reference
    if (practitionerReference) practitionerReferencesCoveredByRole.add(practitionerReference)
  }
  for (const [practitionerReference, practitioner] of practitionerByReference.entries()) {
    if (practitionerReferencesCoveredByRole.has(practitionerReference)) continue
    options.push({
      reference: practitionerReference,
      display: `${getPractitionerDisplayName(practitioner) || practitioner.id || practitionerReference} — Practitioner`,
    })
  }
  return options
}
