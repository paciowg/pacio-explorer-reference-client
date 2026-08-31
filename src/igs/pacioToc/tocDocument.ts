/** Builds PACIO Transitions of Care document resources from reviewed patient data. */
import type {
  Bundle,
  BundleEntry,
  CodeableConcept,
  Composition,
  DocumentReference,
  Identifier,
  Patient,
  Reference,
  Resource,
} from 'fhir/r4'
import { createDocumentBundle } from '../../lib/fhir/documents'

export const TOC_BUNDLE_PROFILE = 'http://hl7.org/fhir/us/pacio-toc/StructureDefinition/TOC-Bundle'
export const TOC_COMPOSITION_PROFILE = 'http://hl7.org/fhir/us/pacio-toc/StructureDefinition/TOC-Composition'
export const TOC_DOCUMENT_REFERENCE_PROFILE = 'http://hl7.org/fhir/us/pacio-toc/StructureDefinition/TOC-DocumentReference'
export const TOC_TYPE_CODE = '18761-7'

const LOINC = 'http://loinc.org'
const TOC_TEMP_CODES = 'http://hl7.org/fhir/us/pacio-toc/CodeSystem/toc-temp-cs'
const EMPTY_REASON_SYSTEM = 'http://terminology.hl7.org/CodeSystem/list-empty-reason'

export type TocStatus = 'preliminary' | 'final' | 'amended'
export type TocSectionKey =
  | 'advanceDirectives' | 'allergies' | 'behavioralHealth' | 'functionalStatus'
  | 'immunizations' | 'dischargeInstructions' | 'medicalDevices' | 'medications'
  | 'planOfCare' | 'problems' | 'procedures' | 'reasonForTransfer'
  | 'clinicalResults' | 'socialHistory' | 'vitalSigns'

export type TocSectionDefinition = {
  key: TocSectionKey
  title: string
  code: string
  system: string
  display: string
}

export const TOC_SECTION_DEFINITIONS: TocSectionDefinition[] = [
  { key: 'advanceDirectives', title: 'Advance Directives', system: LOINC, code: '42348-3', display: 'Advance healthcare directives' },
  { key: 'allergies', title: 'Allergies and Adverse Reactions', system: LOINC, code: '48765-2', display: 'Allergies and adverse reactions Document' },
  { key: 'behavioralHealth', title: 'Behavioral Health', system: TOC_TEMP_CODES, code: 'behavioral_health_summary', display: 'Behavioral Health Summary' },
  { key: 'functionalStatus', title: 'Functional Status', system: LOINC, code: '47420-5', display: 'Functional status' },
  { key: 'immunizations', title: 'Immunizations', system: LOINC, code: '11369-6', display: 'History of Immunization note' },
  { key: 'dischargeInstructions', title: 'Discharge Instructions', system: LOINC, code: '69730-0', display: 'Discharge Instructions' },
  { key: 'medicalDevices', title: 'Medical Devices', system: LOINC, code: '46264-8', display: 'History of medical device use' },
  { key: 'medications', title: 'Medications', system: LOINC, code: '10160-0', display: 'History of Medication Use' },
  { key: 'planOfCare', title: 'Discharge Care Plan', system: LOINC, code: '18776-5', display: 'Plan of care note' },
  { key: 'problems', title: 'Problems', system: LOINC, code: '11450-4', display: 'Problem list - Reported' },
  { key: 'procedures', title: 'Procedures', system: LOINC, code: '47519-4', display: 'History of Procedures Document' },
  { key: 'reasonForTransfer', title: 'Reason for Transfer', system: LOINC, code: '42349-1', display: 'Reason for referral (narrative)' },
  { key: 'clinicalResults', title: 'Clinical Results', system: LOINC, code: '30954-2', display: 'Relevant diagnostic tests/laboratory data note' },
  { key: 'socialHistory', title: 'Social History', system: LOINC, code: '29762-2', display: 'Social history note' },
  { key: 'vitalSigns', title: 'Vital Signs', system: LOINC, code: '8716-3', display: 'Vital signs note' },
]

export type TocSectionSelection = {
  key: TocSectionKey
  entries: Resource[]
  emptyReason: string
}

export type BuildTocBundleInput = {
  patient: Patient
  title: string
  author: Reference
  custodian: Reference
  status: TocStatus
  createdAt: string
  compositionIdentifier: Identifier
  bundleIdentifier: Identifier
  compositionFullUrl: string
  sections: TocSectionSelection[]
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function tocType(): CodeableConcept {
  return { coding: [{ system: LOINC, code: TOC_TYPE_CODE, display: 'Transfer Summary Note' }], text: 'Transfer Summary Note' }
}

function buildSection(definition: TocSectionDefinition, selection: TocSectionSelection | undefined) {
  const entries = selection?.entries.filter((resource) => Boolean(resource.id)) ?? []
  const narrative = entries.length
    ? `${entries.length} selected ${entries.length === 1 ? 'entry' : 'entries'}.`
    : `No entries: ${selection?.emptyReason || 'unavailable'}.`
  return {
    title: definition.title,
    code: { coding: [{ system: definition.system, code: definition.code, display: definition.display }], text: definition.display },
    text: { status: 'generated' as const, div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>${escapeHtml(narrative)}</p></div>` },
    ...(entries.length
      ? { entry: entries.map((resource) => ({ reference: `${resource.resourceType}/${resource.id}` })) }
      : { emptyReason: { coding: [{ system: EMPTY_REASON_SYSTEM, code: selection?.emptyReason || 'unavailable' }] } }),
  }
}

function buildComposition(input: BuildTocBundleInput): Composition {
  return {
    resourceType: 'Composition',
    meta: { profile: [TOC_COMPOSITION_PROFILE] },
    language: 'en-US',
    identifier: input.compositionIdentifier,
    status: input.status,
    type: tocType(),
    category: [tocType()],
    subject: { reference: `Patient/${input.patient.id}`, display: input.patient.name?.[0]?.text },
    date: input.createdAt,
    author: [input.author],
    title: input.title,
    custodian: input.custodian,
    section: TOC_SECTION_DEFINITIONS.map((definition) =>
      buildSection(definition, input.sections.find((selection) => selection.key === definition.key)),
    ),
  }
}

export function buildTocBundle(input: BuildTocBundleInput): Bundle {
  const composition = buildComposition(input)
  const resources = new Map<string, Resource>()
  resources.set(`Patient/${input.patient.id}`, input.patient)
  for (const section of input.sections) {
    for (const resource of section.entries) {
      if (resource.id) resources.set(`${resource.resourceType}/${resource.id}`, resource)
    }
  }
  const supportingEntries: BundleEntry[] = Array.from(resources.entries()).map(([fullUrl, resource]) => ({ fullUrl, resource }))
  return createDocumentBundle({
    timestamp: input.createdAt,
    identifier: input.bundleIdentifier,
    profileUrls: [TOC_BUNDLE_PROFILE],
    compositionEntry: { fullUrl: input.compositionFullUrl, resource: composition },
    supportingEntries,
  })
}

export type BuildTocDocumentReferenceInput = {
  subject: Reference
  author: Reference
  custodian: Reference
  status: TocStatus
  createdAt: string
  title: string
  bundleUrl: string
  documentIdentifier: Identifier
  setIdentifier: Identifier
}

export function buildTocDocumentReference(input: BuildTocDocumentReferenceInput): DocumentReference {
  return {
    resourceType: 'DocumentReference',
    meta: { profile: [TOC_DOCUMENT_REFERENCE_PROFILE] },
    status: 'current',
    docStatus: input.status,
    masterIdentifier: input.documentIdentifier,
    identifier: [input.setIdentifier],
    type: tocType(),
    category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
    subject: input.subject,
    author: [input.author],
    custodian: input.custodian,
    date: input.createdAt,
    description: input.title,
    content: [{ attachment: { contentType: 'application/fhir+json', url: input.bundleUrl, creation: input.createdAt } }],
  }
}
