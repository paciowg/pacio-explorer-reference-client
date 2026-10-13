/** Derives reusable resource choices and selection labels while keeping UI text separate from FHIR reference displays. */
import type { Bundle, Organization, Practitioner, PractitionerRole, RelatedPerson, Resource } from 'fhir/r4'
import { getCodeableConceptText, getDisplayNameFromHumanName, getPractitionerRoleDisplayName } from './formatters'
import { getSimpleResourceDisplay } from './resourceDisplay'
import { serverResourceUrl } from './resourceTransport'

export type ResourceReferenceOption = { reference: string; label: string; display: string; resource: Resource }

export function formatResourceSelectionLabel(resourceType: string, display: string) {
  return `${resourceType}: ${display}`
}

/** Adds useful relationship details and avoids repeating the resource type in unnamed-resource fallbacks. */
export function getResourceSelectionDisplay(resource: Resource): string {
  if (resource.resourceType === 'RelatedPerson') {
    const person = resource as RelatedPerson
    const name = getDisplayNameFromHumanName(person.name?.[0]) || person.id || 'Unnamed'
    const relationship = getCodeableConceptText(person.relationship?.[0])
    return relationship ? `${name} — ${relationship}` : name
  }
  const display = getSimpleResourceDisplay(resource)
  const fallback = `${resource.resourceType}${resource.id ? `/${resource.id}` : ''}`
  return display === fallback ? resource.id || 'Unnamed' : display
}

/** Bases type prefixes on the field's supported types, even when its current choices contain only one type. */
export function getResourceReferenceChoices(options: ResourceReferenceOption[], types: string[]) {
  return options.filter((option) => types.includes(option.resource.resourceType)).map((option) => ({
    value: option.reference,
    label: types.length > 1 ? option.label : option.display,
  }))
}

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

/** Resolves same-server role links for labels and identifies practitioners without an available role. */
export function getPractitionerChoices(bundle: Bundle, baseUrl: string) {
  const practitioners = getPractitionerMap(bundle)
  const coveredPractitioners = new Set<string>()
  // Match only same-server practitioners, including absolute and versioned references.
  for (const { resource } of bundle.entry ?? []) {
    if (resource?.resourceType !== 'PractitionerRole' || !resource.id) continue
    const reference = (resource as PractitionerRole).practitioner?.reference
    if (!reference) continue
    try {
      const id = serverResourceUrl(baseUrl, reference).match(/\/Practitioner\/([^/]+)(?:\/_history\/[^/]+)?$/)?.[1]
      const practitioner = id ? practitioners.get(`Practitioner/${id}`) : undefined
      if (practitioner) {
        practitioners.set(reference, practitioner)
        coveredPractitioners.add(`Practitioner/${id}`)
      }
    } catch { /* References outside the selected server cannot represent its practitioners. */ }
  }
  return {
    practitionerByReference: practitioners,
    roleOptions: getPractitionerRoleOptions(bundle, practitioners),
    // Alias entries support reference resolution but must not become duplicate choices.
    unpairedPractitioners: new Map([...practitioners].filter(([reference, practitioner]) =>
      reference === `Practitioner/${practitioner.id}` && !coveredPractitioners.has(reference))),
  }
}

/** Prefers available roles over their bare practitioners for fields accepting both resource types. */
export function getRolePreferredReferenceOptions(resources: Map<string, Resource>, baseUrl: string): ResourceReferenceOption[] {
  const bundle: Bundle = { resourceType: 'Bundle', type: 'collection', entry: [...resources.values()].map((resource) => ({ resource })) }
  const { roleOptions, unpairedPractitioners } = getPractitionerChoices(bundle, baseUrl)
  const roles = new Map(roleOptions.map((option) => [`PractitionerRole/${option.role.id}`, option.label]))
  return [...resources].filter(([reference, resource]) => resource.resourceType !== 'Practitioner' || unpairedPractitioners.has(reference)).map(([reference, resource]) => {
    const display = roles.get(reference) || getResourceSelectionDisplay(resource)
    return { reference, resource, display, label: formatResourceSelectionLabel(resource.resourceType, display) }
  }).sort((a, b) => a.label.localeCompare(b.label))
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
