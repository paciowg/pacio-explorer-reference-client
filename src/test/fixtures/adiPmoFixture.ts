import type { Patient, Practitioner, PractitionerRole } from 'fhir/r4'

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

// This fixed input is the representative pre-refactor PMO fixture. Tests assert
// its generated resources field-by-field so later milestones can compare output
// after normalizing UUIDs and creation timestamps.
export const preRefactorAdiPmoInput = {
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

export const preRefactorDocumentReferenceInput = {
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
