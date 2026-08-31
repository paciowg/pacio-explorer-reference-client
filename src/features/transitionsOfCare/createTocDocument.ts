/** Orchestrates construction and posting of a TOC Bundle and companion DocumentReference. */
import type { Identifier, Patient, Reference } from 'fhir/r4'
import { buildTocBundle, buildTocDocumentReference, type TocSectionSelection, type TocStatus } from '../../igs/pacioToc/tocDocument'
import { withUrnUuidBundleReferences } from '../../lib/fhir/bundleReferences'
import { createBundle, createDocumentReference } from '../../lib/fhir/client'
import { closeBundleReferences } from '../../lib/fhir/closedBundle'
import { normalizeBaseUrl } from '../../lib/fhir/url'

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
  const closedBundle = await closeBundleReferences(input.baseUrl, initialBundle)
  const createdBundle = await createBundle(input.baseUrl, withUrnUuidBundleReferences(closedBundle))
  if (!createdBundle.id) throw new Error('The server did not return an id for the created TOC Bundle.')

  return createDocumentReference(input.baseUrl, buildTocDocumentReference({
    subject: { reference: `Patient/${input.patient.id}`, display: input.patient.name?.[0]?.text },
    author: input.author,
    custodian: input.custodian,
    status: input.status,
    createdAt: input.createdAt,
    title: input.title,
    bundleUrl: `${normalizeBaseUrl(input.baseUrl)}/Bundle/${createdBundle.id}`,
    documentIdentifier,
    setIdentifier: urnIdentifier(),
  }))
}
