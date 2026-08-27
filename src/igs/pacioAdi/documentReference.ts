import type { CodeableConcept, DocumentReference, Period, Reference } from 'fhir/r4'
import { createAhdCategory, createPmoType, type PmoStatus } from './pmoDocument'
import { formatAdiVersionNumber } from './version'
import {
  createAdiDocumentIdentifier,
  createAdiDocumentSetIdentifier,
} from './identifiers'

export type CreateAdiDocumentReferenceInput = {
  subject: Reference
  author: Reference[]
  authenticator?: Reference
  custodian?: Reference
  status: PmoStatus
  signedDate: string
  createdAt: string
  jurisdiction?: CodeableConcept
  contextPeriod: Period
  bundleUrl: string
  documentIdentifierValue: string
  setIdentifierValue: string
}

const ADI_DOCUMENT_REFERENCE_PROFILE_URL = 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-DocumentReference'
const ADI_DOC_VERSION_EXTENSION_URL = 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-docVersionNumber-extension'
const ADI_JURISDICTION_EXTENSION_URL = 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-jurisdiction-extension'
const US_CORE_AUTHENTICATION_TIME_EXTENSION_URL = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-authentication-time'

export function buildAdiDocumentReference(input: CreateAdiDocumentReferenceInput): DocumentReference {
  const patientName = input.subject.display || 'Patient'
  return {
    resourceType: 'DocumentReference',
    meta: { profile: [ADI_DOCUMENT_REFERENCE_PROFILE_URL] },
    status: 'current', docStatus: input.status,
    extension: [
      { url: US_CORE_AUTHENTICATION_TIME_EXTENSION_URL, valueDateTime: input.signedDate },
      { url: ADI_DOC_VERSION_EXTENSION_URL, valueString: formatAdiVersionNumber(input.createdAt) },
      ...(input.jurisdiction ? [{ url: ADI_JURISDICTION_EXTENSION_URL, valueCodeableConcept: input.jurisdiction }] : []),
    ],
    masterIdentifier: createAdiDocumentIdentifier(input.documentIdentifierValue),
    identifier: [createAdiDocumentSetIdentifier(input.setIdentifierValue)],
    type: createPmoType(), category: [createAhdCategory()],
    subject: input.subject, author: input.author,
    ...(input.authenticator ? { authenticator: input.authenticator } : {}),
    ...(input.custodian ? { custodian: input.custodian } : {}),
    date: input.createdAt,
    description: `${patientName} ADI POLST PMO Document`,
    context: { period: input.contextPeriod },
    content: [{ attachment: { contentType: 'application/fhir+json', url: input.bundleUrl, creation: input.createdAt } }],
  }
}
