import type {
  Binary,
  Bundle,
  BundleEntry,
  CodeableConcept,
  Composition,
  Identifier,
  Patient,
  Practitioner,
  PractitionerRole,
  Reference,
  Resource,
} from 'fhir/r4'
import { createDocumentBundle } from '../../lib/fhir/documents'
import { getDisplayNameFromHumanName, getPractitionerRoleDisplayName } from '../../lib/fhir/formatters'
import { formatAdiVersionNumber } from './version'

export type PmoStatus = 'preliminary' | 'final' | 'amended'
export type PmoAttesterOption = { reference: string; display: string }
export type PmoDataEntererOption = { reference: string; display: string }

export type CreateAdiPmoBundleInput = {
  patient: Patient
  practitionerRole: PractitionerRole
  practitionerByReference: Map<string, Practitioner>
  attester: PmoAttesterOption
  facilitator?: Reference
  dataEnterer?: PmoDataEntererOption
  custodian?: Reference
  status: PmoStatus
  signedDate: string
  createdAt: string
  pdfBase64: string
  documentIdentifier: Identifier
  compositionFullUrl: string
}

const ADI_SOURCE_FORM_BINARY_PROFILE = 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-ADISourceFormInformation'
const ADI_PMO_COMPOSITION_PROFILE = 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-PMOComposition'
const ADI_DOC_VERSION_EXTENSION_URL = 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-docVersionNumber-extension'
const ADI_DATA_ENTERER_EXTENSION_URL = 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-dataEnterer-extension'
const ADI_TEMP_CODE_SYSTEM = 'http://hl7.org/fhir/us/pacio-adi/CodeSystem/ADITempCS'
const ACP_SERVICES_CODE = { system: ADI_TEMP_CODE_SYSTEM, code: 'acp-services', display: 'Advance care planning services' } as const
const SOURCE_FORM_BINARY_ID = 'source-form-binary'

export function createPmoType(): CodeableConcept {
  return { coding: [{ system: 'http://loinc.org', code: '93037-0', display: 'Portable medical order form' }], text: 'Portable medical order form' }
}

export function createAhdCategory(): CodeableConcept {
  return { coding: [{ system: 'http://loinc.org', code: '42348-3', display: 'Advance healthcare directives' }], text: 'Advance healthcare directives' }
}

function createClinicalNoteCategory(): CodeableConcept {
  return { coding: [{ system: 'http://loinc.org', code: '107903-7', display: 'Clinical note' }], text: 'Clinical note' }
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function getStatusLabel(status: PmoStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function buildCompositionNarrative(input: { patientDisplayName: string; authorDisplayName: string; attesterDisplay: string; signedDate: string; status: PmoStatus; facilitatorDisplay?: string; dataEntererDisplay?: string }) {
  const detailParts = [
    `Status: ${escapeHtml(getStatusLabel(input.status))}`,
    `Author: ${escapeHtml(input.authorDisplayName)}`,
    `Attester: ${escapeHtml(input.attesterDisplay)}`,
    `Date signed: ${escapeHtml(input.signedDate)}`,
    input.facilitatorDisplay ? `Facilitator: ${escapeHtml(input.facilitatorDisplay)}` : '',
    input.dataEntererDisplay ? `Data enterer: ${escapeHtml(input.dataEntererDisplay)}` : '',
    'Includes advance directive source form PDF.',
  ].filter(Boolean)
  return {
    status: 'generated',
    div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>ADI Portable Medical Order for ${escapeHtml(input.patientDisplayName)}.</p><p>${detailParts.join(' ')}</p></div>`,
  } satisfies Composition['text']
}

function buildSourceFormBinary(input: CreateAdiPmoBundleInput): Binary {
  return { resourceType: 'Binary', id: SOURCE_FORM_BINARY_ID, meta: { profile: [ADI_SOURCE_FORM_BINARY_PROFILE] }, contentType: 'application/pdf', data: input.pdfBase64 }
}

function buildComposition(input: CreateAdiPmoBundleInput, sourceFormBinary: Binary): Composition {
  const patientDisplayName = getDisplayNameFromHumanName(input.patient.name?.[0]) || input.patient.id || 'Unknown patient'
  const authorDisplayName = getPractitionerRoleDisplayName(input.practitionerRole, input.practitionerByReference)
  return {
    resourceType: 'Composition',
    meta: { profile: [ADI_PMO_COMPOSITION_PROFILE] },
    identifier: input.documentIdentifier,
    language: 'en-US',
    text: buildCompositionNarrative({ patientDisplayName, authorDisplayName, attesterDisplay: input.attester.display, signedDate: input.signedDate, status: input.status, facilitatorDisplay: input.facilitator?.display, dataEntererDisplay: input.dataEnterer?.display }),
    extension: [
      { url: ADI_DOC_VERSION_EXTENSION_URL, valueString: formatAdiVersionNumber(input.createdAt) },
      ...(input.dataEnterer ? [{ url: ADI_DATA_ENTERER_EXTENSION_URL, valueReference: { reference: input.dataEnterer.reference, display: input.dataEnterer.display } }] : []),
    ],
    status: input.status,
    type: createPmoType(),
    category: [createClinicalNoteCategory(), createAhdCategory()],
    subject: { reference: `Patient/${input.patient.id}`, display: patientDisplayName },
    date: input.createdAt,
    author: [{ reference: `PractitionerRole/${input.practitionerRole.id}`, display: authorDisplayName }],
    title: `ADI POLST PMO for ${patientDisplayName}`,
    attester: [{ mode: 'legal', time: input.signedDate, party: { reference: input.attester.reference, display: input.attester.display } }],
    ...(input.custodian ? { custodian: input.custodian } : {}),
    ...(input.facilitator ? { event: [{ code: [{ coding: [ACP_SERVICES_CODE], text: ACP_SERVICES_CODE.display }], detail: [input.facilitator] }] } : {}),
    section: [
      {
        title: 'Advance directive source form',
        code: { coding: [{ system: ADI_TEMP_CODE_SYSTEM, code: 'advance_directive_source_form', display: 'Advance directive source form' }], text: 'Advance directive source form' },
        text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>Attached source form PDF for ${escapeHtml(patientDisplayName)}</p></div>` },
        entry: [{ reference: `${sourceFormBinary.resourceType}/${sourceFormBinary.id}` }],
      },
      {
        title: 'Portable Medical Orders', code: createPmoType(),
        text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>Minimal structured PMO metadata for ${escapeHtml(patientDisplayName)}. Author: ${escapeHtml(authorDisplayName)}. Attester: ${escapeHtml(input.attester.display)}. Signed: ${escapeHtml(input.signedDate)}${input.facilitator?.display ? `. Facilitator: ${escapeHtml(input.facilitator.display)}` : ''}${input.dataEnterer?.display ? `. Data enterer: ${escapeHtml(input.dataEnterer.display)}` : ''}.</p></div>` },
      },
    ],
  }
}

export function buildAdiPmoBundle(input: CreateAdiPmoBundleInput): Bundle {
  const sourceFormBinary = buildSourceFormBinary(input)
  const composition = buildComposition(input, sourceFormBinary)
  const supportingEntries: BundleEntry[] = [{ fullUrl: `${sourceFormBinary.resourceType}/${sourceFormBinary.id}`, resource: sourceFormBinary }]
  const referencesToInclude = new Set<string>([
    `Patient/${input.patient.id}`, `PractitionerRole/${input.practitionerRole.id}`, input.attester.reference,
    ...(input.facilitator?.reference ? [input.facilitator.reference] : []),
    ...(input.dataEnterer?.reference ? [input.dataEnterer.reference] : []),
  ])
  const practitionerReference = input.practitionerRole.practitioner?.reference
  if (practitionerReference) referencesToInclude.add(practitionerReference)
  const additionalResources: Resource[] = [input.patient, input.practitionerRole]
  if (practitionerReference) {
    const practitioner = input.practitionerByReference.get(practitionerReference)
    if (practitioner) additionalResources.push(practitioner)
  }
  for (const resource of additionalResources) {
    if (resource.id && referencesToInclude.has(`${resource.resourceType}/${resource.id}`)) {
      supportingEntries.push({ fullUrl: `${resource.resourceType}/${resource.id}`, resource })
    }
  }
  return createDocumentBundle({
    timestamp: input.createdAt,
    compositionEntry: { fullUrl: input.compositionFullUrl, resource: composition },
    supportingEntries,
  })
}
