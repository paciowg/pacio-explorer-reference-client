/** Orchestrates construction and posting of a TOC Bundle and companion DocumentReference. */
import type { Identifier, Patient, Reference } from 'fhir/r4'
import { buildTocBundle, buildTocDocumentReference, type TocSectionSelection, type TocStatus } from '../../igs/pacioToc/tocDocument'
import { publishDocument } from '../../lib/fhir/documentPublishing'
import { normalizeBaseUrl } from '../../lib/fhir/url'

function uuid() {
  return crypto.randomUUID()
}

function urnIdentifier(): Identifier {
  return { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${uuid()}` }
}

export type CreateTocDocumentInput = {
  sourceBaseUrl: string
  destinationBaseUrl: string
  patient: Patient
  title: string
  author: Reference
  custodian: Reference
  status: TocStatus
  createdAt: string
  sections: TocSectionSelection[]
}

export async function createTocDocument(input: CreateTocDocumentInput) {
  const documentIdentifier = urnIdentifier()
  const isCrossServer = normalizeBaseUrl(input.sourceBaseUrl) !==
    normalizeBaseUrl(input.destinationBaseUrl)
  const initialBundle = buildTocBundle({
    ...input,
    compositionIdentifier: documentIdentifier,
    bundleIdentifier: urnIdentifier(),
    compositionFullUrl: `urn:uuid:${uuid()}`,
  })
  return publishDocument({
    sourceBaseUrl: input.sourceBaseUrl,
    destinationBaseUrl: input.destinationBaseUrl,
    patient: input.patient,
    bundle: initialBundle,
    missingBundleIdMessage: 'The server did not return an id for the created TOC Bundle.',
    buildDocumentReference: (bundleUrl, destinationPatient) => buildTocDocumentReference({
      subject: {
        reference: `Patient/${destinationPatient.id}`,
        display: destinationPatient.name?.[0]?.text,
      },
      // These optional Must Support references use source-local ids. Cross-server publication
      // omits them from the index; participant details represented by the Composition remain.
      author: isCrossServer ? undefined : input.author,
      custodian: isCrossServer ? undefined : input.custodian,
      status: input.status,
      createdAt: input.createdAt,
      title: input.title,
      bundleUrl,
      documentIdentifier,
      setIdentifier: urnIdentifier(),
    }),
  })
}
