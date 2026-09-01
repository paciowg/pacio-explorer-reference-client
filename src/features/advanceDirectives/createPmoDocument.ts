/** Orchestrates construction and posting of an ADI PMO Bundle and its companion DocumentReference. */
import type { CodeableConcept, Patient, Practitioner, PractitionerRole, Reference } from 'fhir/r4'
import { publishDocument } from '../../lib/fhir/documentPublishing'
import { normalizeBaseUrl } from '../../lib/fhir/url'
import { buildAdiDocumentReference } from '../../igs/pacioAdi/documentReference'
import { buildAdiPmoBundle, type PmoAttesterOption, type PmoDataEntererOption, type PmoStatus } from '../../igs/pacioAdi/pmoDocument'

function createIdentifierValue() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `identifier-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export type CreatePmoDocumentInput = {
  sourceBaseUrl: string
  destinationBaseUrl: string
  patient: Patient
  practitionerRole: PractitionerRole
  practitionerByReference: Map<string, Practitioner>
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
  const isCrossServer = normalizeBaseUrl(input.sourceBaseUrl) !==
    normalizeBaseUrl(input.destinationBaseUrl)
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
    sourceBaseUrl: input.sourceBaseUrl,
    destinationBaseUrl: input.destinationBaseUrl,
    patient: input.patient,
    bundle: initialBundle,
    missingBundleIdMessage: 'The server did not return an id for the created Bundle.',
    buildDocumentReference: (bundleUrl, destinationPatient) => buildAdiDocumentReference({
      subject: {
        reference: `Patient/${destinationPatient.id}`,
        display: destinationPatient.name?.[0]?.text,
      },
      // These optional Must Support references use source-local ids. Cross-server publication
      // omits them from the index; participant details represented by the Composition remain.
      author: isCrossServer ? undefined : [input.author],
      authenticator: isCrossServer ? undefined : input.authenticator,
      custodian: isCrossServer ? undefined : input.custodian,
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
