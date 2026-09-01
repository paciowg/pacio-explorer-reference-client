/** Orchestrates construction and posting of a TOC Bundle and companion DocumentReference. */
import type { Identifier, Patient, Reference } from 'fhir/r4'
import { buildTocBundle, buildTocDocumentReference, type TocSectionSelection, type TocStatus } from '../../igs/pacioToc/tocDocument'
import { publishDocument } from '../../lib/fhir/documentPublishing'

function uuid() {
  return crypto.randomUUID()
}

function urnIdentifier(): Identifier {
  return { system: 'urn:ietf:rfc:3986', value: `urn:uuid:${uuid()}` }
}

export type CreateTocDocumentInput = {
  baseUrl: string
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
  const initialBundle = buildTocBundle({
    ...input,
    compositionIdentifier: documentIdentifier,
    bundleIdentifier: urnIdentifier(),
    compositionFullUrl: `urn:uuid:${uuid()}`,
  })
  return publishDocument({
    baseUrl: input.baseUrl,
    bundle: initialBundle,
    missingBundleIdMessage: 'The server did not return an id for the created TOC Bundle.',
    buildDocumentReference: (bundleUrl) => buildTocDocumentReference({
      subject: { reference: `Patient/${input.patient.id}`, display: input.patient.name?.[0]?.text },
      author: input.author,
      custodian: input.custodian,
      status: input.status,
      createdAt: input.createdAt,
      title: input.title,
      bundleUrl,
      documentIdentifier,
      setIdentifier: urnIdentifier(),
    }),
  })
}
