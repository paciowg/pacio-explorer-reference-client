import type { CodeableConcept, Identifier, Patient, Practitioner, PractitionerRole, Reference } from 'fhir/r4'
import { withUrnUuidBundleReferences } from '../../lib/fhir/bundleReferences'
import { closeBundleReferences } from '../../lib/fhir/closedBundle'
import { createBundle, createDocumentReference } from '../../lib/fhir/client'
import { normalizeBaseUrl } from '../../lib/fhir/url'
import { buildAdiDocumentReference } from '../../igs/pacioAdi/documentReference'
import { buildAdiPmoBundle, type PmoAttesterOption, type PmoDataEntererOption, type PmoStatus } from '../../igs/pacioAdi/pmoDocument'

const ADI_DOCUMENT_IDENTIFIER_SYSTEM = 'https://pacioproject.org/adi-document-identifier'
const ADI_DOCUMENT_SET_IDENTIFIER_SYSTEM = 'https://pacioproject.org/adi-document-set-identifier'

function createIdentifier(system: string): Identifier {
  const value = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `identifier-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return { system, value }
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
  const documentIdentifier = createIdentifier(ADI_DOCUMENT_IDENTIFIER_SYSTEM)
  const setIdentifier = createIdentifier(ADI_DOCUMENT_SET_IDENTIFIER_SYSTEM)
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
    documentIdentifier,
    compositionFullUrl,
  })
  const closedBundle = await closeBundleReferences(input.baseUrl, initialBundle)
  const bundle = withUrnUuidBundleReferences(closedBundle)
  const createdBundle = await createBundle(input.baseUrl, bundle)

  if (!createdBundle.id) {
    throw new Error('The server did not return an id for the created Bundle.')
  }

  const documentReference = buildAdiDocumentReference({
    subject: input.subject,
    author: [input.author],
    authenticator: input.authenticator,
    custodian: input.custodian,
    status: input.status,
    signedDate: input.signedDate,
    createdAt: input.createdAt,
    jurisdiction: input.jurisdiction,
    contextPeriod: { start: input.signedDate, end: input.contextPeriodEnd },
    bundleUrl: `${normalizeBaseUrl(input.baseUrl)}/Bundle/${createdBundle.id}`,
    documentIdentifier,
    setIdentifier,
  })
  return createDocumentReference(input.baseUrl, documentReference)
}
