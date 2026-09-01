/** Converts practitioner and organization resources into reusable, sorted form options. */
import type { Bundle, Organization, Practitioner, PractitionerRole, Resource } from 'fhir/r4'
import { getPractitionerRoleDisplayName } from './formatters'

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

function isPractitioner(resource: Resource | undefined): resource is Practitioner {
  return resource?.resourceType === 'Practitioner'
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

function getOrganizationDisplayName(organization: Organization) {
  return organization.name || organization.alias?.find(Boolean) || organization.id || 'Organization'
}

export function getOrganizationOptions(bundle: Bundle) {
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
