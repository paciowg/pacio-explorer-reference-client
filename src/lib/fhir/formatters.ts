/** Formats common FHIR datatypes for display without applying workflow-specific semantics. */
import type {
  Address,
  CodeableConcept,
  ContactPoint,
  HumanName,
  Identifier,
  Narrative,
  Practitioner,
  PractitionerRole,
} from 'fhir/r4'

export function placeholderValue() {
  return '--'
}

export function getDisplayNameFromHumanName(name: HumanName | undefined) {
  if (!name) return ''

  if (name.text?.trim()) return name.text.trim()

  const given = (name.given ?? []).join(' ').trim()
  const family = name.family?.trim() || ''
  return [given, family].filter(Boolean).join(' ').trim()
}

export function getFirstMrn(identifiers: Identifier[] | undefined) {
  return identifiers?.find((identifier) =>
    identifier.type?.coding?.some((coding) => coding.code === 'MR'),
  )?.value
}

export function formatPhone(telecom: ContactPoint[] | undefined) {
  const phone = telecom?.find((item) => item.system === 'phone')?.value
  return phone || placeholderValue()
}

export function formatAddress(address: Address | undefined) {
  if (!address) return placeholderValue()
  if (address.text?.trim()) return address.text.trim()

  const lines = [
    ...(address.line ?? []),
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ].filter(Boolean)

  return lines.length > 0 ? lines.join(', ') : placeholderValue()
}

export function getCodeableConceptText(codeableConcept: CodeableConcept | undefined) {
  const text = codeableConcept?.text?.trim()
  if (text) return text

  const display = codeableConcept?.coding
    ?.map((coding) => coding.display?.trim())
    .find(Boolean)
  if (display) return display

  return codeableConcept?.coding
    ?.map((coding) => coding.code?.trim())
    .find(Boolean) || ''
}

function decodeXhtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  }
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16))
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10))
    return namedEntities[name.toLowerCase()] ?? entity
  })
}

/** Converts generated FHIR XHTML narrative to normalized text without rendering its markup. */
export function getNarrativeText(narrative: Narrative | undefined) {
  if (!narrative?.div) return ''
  const withoutExecutableContent = narrative.div
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
  return decodeXhtmlEntities(withoutExecutableContent).replace(/\s+/g, ' ').trim()
}

export function formatDate(value: string | undefined) {
  if (!value) return placeholderValue()

  const isoDateMatch = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoDateMatch) {
    return isoDateMatch[1]
  }

  return value
}

export function getPractitionerDisplayName(practitioner: Practitioner | undefined) {
  if (!practitioner) return ''
  return getDisplayNameFromHumanName(practitioner.name?.[0]) || practitioner.id || ''
}

export function getPractitionerRoleDisplayName(
  role: PractitionerRole,
  practitionerByReference: Map<string, Practitioner>,
) {
  const practitionerReference = role.practitioner?.reference
  const practitioner = practitionerReference
    ? practitionerByReference.get(practitionerReference)
    : undefined

  const practitionerName = getPractitionerDisplayName(practitioner)
  const roleLabel =
    role.code?.[0]?.text ||
    role.code?.[0]?.coding?.[0]?.display ||
    role.code?.[0]?.coding?.[0]?.code ||
    ''

  if (practitionerName && roleLabel) {
    return `${practitionerName} — ${roleLabel}`
  }

  return practitionerName || roleLabel || role.id || placeholderValue()
}
