/** Provides a fixed, representative PACIO ADI PMO Bundle and companion DocumentReference for tests. */
import type {
  Binary,
  Bundle,
  Composition,
  DocumentReference,
  Patient,
  Practitioner,
  PractitionerRole,
} from 'fhir/r4'

export const FIXED_CREATED_AT = '2025-01-02T03:04:05.000Z'
export const FIXED_SIGNED_DATE = '2025-01-01T00:00:00.000Z'

export const fixturePatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-1',
  name: [{ given: ['Ada'], family: 'Lovelace' }],
}

export const fixturePractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-1',
  name: [{ text: 'Dr. Grace Hopper' }],
}

export const fixturePractitionerRole: PractitionerRole = {
  resourceType: 'PractitionerRole',
  id: 'role-1',
  practitioner: { reference: 'Practitioner/practitioner-1' },
  code: [{ text: 'Physician' }],
}

// These fixed values represent the intended PMO output. In particular, the
// Composition identifier and companion DocumentReference master identifier
// identify the same document and therefore share one value.
export const representativeAdiPmoInput = {
  patient: fixturePatient,
  practitionerRole: fixturePractitionerRole,
  practitionerByReference: new Map([['Practitioner/practitioner-1', fixturePractitioner]]),
  attester: { reference: 'RelatedPerson/attester-1', display: 'Alex Attester' },
  facilitator: { reference: 'PractitionerRole/facilitator-1', display: 'Fran Facilitator' },
  dataEnterer: { reference: 'RelatedPerson/enterer-1', display: 'Dana Enterer' },
  custodian: { reference: 'Organization/custodian-1', display: 'Custodian Health' },
  status: 'final' as const,
  signedDate: FIXED_SIGNED_DATE,
  createdAt: FIXED_CREATED_AT,
  pdfBase64: 'JVBERi0xLjQ=',
}

export const representativeDocumentReferenceInput = {
  subject: { reference: 'Patient/patient-1', display: 'Ada Lovelace' },
  author: [{ reference: 'PractitionerRole/role-1', display: 'Dr. Grace Hopper — Physician' }],
  authenticator: { reference: 'RelatedPerson/attester-1', display: 'Alex Attester' },
  type: {
    coding: [{ system: 'http://loinc.org', code: '93037-0', display: 'Portable medical order form' }],
    text: 'Portable medical order form',
  },
  category: [{
    coding: [{ system: 'http://loinc.org', code: '42348-3', display: 'Advance healthcare directives' }],
    text: 'Advance healthcare directives',
  }],
  contentUrl: 'https://example.test/fhir/Bundle/bundle-1',
  contentType: 'application/fhir+json',
  docStatus: 'final' as const,
  description: 'Ada Lovelace ADI POLST PMO Document',
  version: '20250102030405',
  createdAt: FIXED_CREATED_AT,
  authenticationTime: FIXED_SIGNED_DATE,
  profileUrls: ['http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-DocumentReference'],
  custodian: { reference: 'Organization/custodian-1', display: 'Custodian Health' },
  identifier: [{ system: 'https://pacioproject.org/adi-document-set-identifier', value: 'set-1' }],
  masterIdentifier: { system: 'https://pacioproject.org/adi-document-identifier', value: 'document-1' },
  jurisdiction: { coding: [{ system: 'urn:iso:std:iso:3166', code: 'US-MA' }] },
  contextPeriod: { start: FIXED_SIGNED_DATE, end: '2026-01-01T00:00:00.000Z' },
}

export const representativeAdiPmoBundle: Bundle = {
  resourceType: 'Bundle',
  type: 'document',
  timestamp: FIXED_CREATED_AT,
  entry: [
    {
      fullUrl: 'urn:uuid:composition-uuid',
      resource: {
        resourceType: 'Composition',
        meta: { profile: ['http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-PMOComposition'] },
        identifier: { system: 'https://pacioproject.org/adi-document-identifier', value: 'document-1' },
        language: 'en-US',
        text: {
          status: 'generated',
          div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>ADI Portable Medical Order for Ada Lovelace.</p><p>Status: Final Author: Dr. Grace Hopper — Physician Attester: Alex Attester Date signed: 2025-01-01T00:00:00.000Z Facilitator: Fran Facilitator Data enterer: Dana Enterer Includes advance directive source form PDF.</p></div>',
        },
        extension: [
          { url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-docVersionNumber-extension', valueString: '20250102030405' },
          { url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-dataEnterer-extension', valueReference: { reference: 'RelatedPerson/enterer-1', display: 'Dana Enterer' } },
        ],
        status: 'final',
        type: {
          coding: [{ system: 'http://loinc.org', code: '93037-0', display: 'Portable medical order form' }],
          text: 'Portable medical order form',
        },
        category: [
          { coding: [{ system: 'http://loinc.org', code: '107903-7', display: 'Clinical note' }], text: 'Clinical note' },
          { coding: [{ system: 'http://loinc.org', code: '42348-3', display: 'Advance healthcare directives' }], text: 'Advance healthcare directives' },
        ],
        subject: { reference: 'Patient/patient-1', display: 'Ada Lovelace' },
        date: FIXED_CREATED_AT,
        author: [{ reference: 'PractitionerRole/role-1', display: 'Dr. Grace Hopper — Physician' }],
        title: 'ADI POLST PMO for Ada Lovelace',
        attester: [{ mode: 'legal', time: FIXED_SIGNED_DATE, party: { reference: 'RelatedPerson/attester-1', display: 'Alex Attester' } }],
        custodian: { reference: 'Organization/custodian-1', display: 'Custodian Health' },
        event: [{ code: [{ coding: [{ system: 'http://hl7.org/fhir/us/pacio-adi/CodeSystem/ADITempCS', code: 'acp-services', display: 'Advance care planning services' }], text: 'Advance care planning services' }], detail: [{ reference: 'PractitionerRole/facilitator-1', display: 'Fran Facilitator' }] }],
        section: [
          {
            title: 'Advance directive source form',
            code: { coding: [{ system: 'http://hl7.org/fhir/us/pacio-adi/CodeSystem/ADITempCS', code: 'advance_directive_source_form', display: 'Advance directive source form' }], text: 'Advance directive source form' },
            text: { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Attached source form PDF for Ada Lovelace</p></div>' },
            entry: [{ reference: 'Binary/source-form-binary' }],
          },
          {
            title: 'Portable Medical Orders',
            code: { coding: [{ system: 'http://loinc.org', code: '93037-0', display: 'Portable medical order form' }], text: 'Portable medical order form' },
            text: { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Minimal structured PMO metadata for Ada Lovelace. Author: Dr. Grace Hopper — Physician. Attester: Alex Attester. Signed: 2025-01-01T00:00:00.000Z. Facilitator: Fran Facilitator. Data enterer: Dana Enterer.</p></div>' },
          },
        ],
      } as Composition,
    },
    {
      fullUrl: 'Binary/source-form-binary',
      resource: { resourceType: 'Binary', id: 'source-form-binary', meta: { profile: ['http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-ADISourceFormInformation'] }, contentType: 'application/pdf', data: 'JVBERi0xLjQ=' } as Binary,
    },
    { fullUrl: 'Patient/patient-1', resource: fixturePatient },
    { fullUrl: 'PractitionerRole/role-1', resource: fixturePractitionerRole },
    { fullUrl: 'Practitioner/practitioner-1', resource: fixturePractitioner },
  ],
}

export const representativeAdiDocumentReference: DocumentReference = {
  resourceType: 'DocumentReference',
  meta: { profile: ['http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-DocumentReference'] },
  status: 'current',
  docStatus: 'final',
  extension: [
    { url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-authentication-time', valueDateTime: FIXED_SIGNED_DATE },
    { url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-docVersionNumber-extension', valueString: '20250102030405' },
    { url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-jurisdiction-extension', valueCodeableConcept: representativeDocumentReferenceInput.jurisdiction },
  ],
  masterIdentifier: representativeDocumentReferenceInput.masterIdentifier,
  identifier: representativeDocumentReferenceInput.identifier,
  type: representativeDocumentReferenceInput.type,
  category: representativeDocumentReferenceInput.category,
  subject: representativeDocumentReferenceInput.subject,
  author: representativeDocumentReferenceInput.author,
  authenticator: representativeDocumentReferenceInput.authenticator,
  custodian: representativeDocumentReferenceInput.custodian,
  date: FIXED_CREATED_AT,
  description: representativeDocumentReferenceInput.description,
  context: { period: representativeDocumentReferenceInput.contextPeriod },
  content: [{ attachment: { contentType: 'application/fhir+json', url: representativeDocumentReferenceInput.contentUrl, creation: FIXED_CREATED_AT } }],
}
