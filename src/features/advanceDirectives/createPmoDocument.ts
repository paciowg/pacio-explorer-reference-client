/** Orchestrates construction and posting of an ADI PMO Bundle and its companion DocumentReference. */
import type { CodeableConcept, Patient, Practitioner, PractitionerRole, Reference } from 'fhir/r4'
import { publishDocument } from '../../lib/fhir/documentPublishing'
import { buildAdiDocumentReference } from '../../igs/pacioAdi/documentReference'
import { buildAdiPmoBundle, type PmoAttesterOption, type PmoDataEntererOption, type PmoStatus } from '../../igs/pacioAdi/pmoDocument'

function createIdentifierValue() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `identifier-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export type CreatePmoDocumentInput = {
  baseUrl: string
  patient: Patient
  practitionerRole: PractitionerRole
  practitionerByReference: Map<string, Practitioner>
  subject: Reference
  author: Reference
  attester: PmoAttesterOption
  authenticator?: Reference
  facilitator?: Reference
  dataEnterer?: PmoDataEntererOption
  custodian?: Reference
  status: PmoStatus
  signedDate: string
  contextPeriodEnd: string
  createdAt: string
  pdfBase64: string
  jurisdiction?: CodeableConcept
}

export async function createPmoDocument(input: CreatePmoDocumentInput) {
  // Composition.identifier and DocumentReference.masterIdentifier describe the same document.
  const documentIdentifierValue = createIdentifierValue()
  const setIdentifierValue = createIdentifierValue()
  const compositionFullUrl = `urn:uuid:${crypto.randomUUID()}`
  const initialBundle = buildAdiPmoBundle({
    patient: input.patient,
    practitionerRole: input.practitionerRole,
    practitionerByReference: input.practitionerByReference,
    attester: input.attester,
    facilitator: input.facilitator,
    dataEnterer: input.dataEnterer,
    custodian: input.custodian,
    status: input.status,
    signedDate: input.signedDate,
    createdAt: input.createdAt,
    pdfBase64: input.pdfBase64,
    documentIdentifierValue,
    compositionFullUrl,
  })
  return publishDocument({
    baseUrl: input.baseUrl,
    bundle: initialBundle,
    missingBundleIdMessage: 'The server did not return an id for the created Bundle.',
    buildDocumentReference: (bundleUrl) => buildAdiDocumentReference({
      subject: input.subject,
      author: [input.author],
      authenticator: input.authenticator,
      custodian: input.custodian,
      status: input.status,
      signedDate: input.signedDate,
      createdAt: input.createdAt,
      jurisdiction: input.jurisdiction,
      contextPeriod: { start: input.signedDate, end: input.contextPeriodEnd },
      bundleUrl,
      documentIdentifierValue,
      setIdentifierValue,
    }),
  })
}
