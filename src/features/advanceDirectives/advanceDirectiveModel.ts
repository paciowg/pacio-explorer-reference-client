/** Derives display rows and PDF viewers from DocumentReference and document Bundle resources. */
import type {
  Binary,
  Bundle,
  CodeableConcept,
  Composition,
  DocumentReference,
  Identifier,
  Reference,
  Resource,
} from 'fhir/r4'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import {
  formatDate,
  getCodeableConceptText,
  placeholderValue,
} from '../../lib/fhir/formatters'
import { normalizeBaseUrl } from '../../lib/fhir/url'
import { readAdiDocument } from '../../igs/pacioAdi/adiDocument'
import {
  createAttachmentViewer,
  createBinaryViewer,
  type AttachmentViewer,
} from './browserAttachments'

export type DetailRow = { label: string; value: string }
export type BundleDerivedData = {
  composition: Composition
  pdfViewers: AttachmentViewer[]
}

export const MISSING_COMPOSITION_WARNING =
  'A Bundle was referenced, but no Composition was found. Showing DocumentReference details.'

export function getBundleLoadWarning(error: unknown) {
  return error instanceof Error
    ? `Unable to load referenced Bundle. ${error.message}`
    : 'Unable to load referenced Bundle. Showing DocumentReference details.'
}

function formatReference(reference: Reference | undefined) {
  if (!reference) return placeholderValue()
  return reference.display || reference.reference || placeholderValue()
}

function formatReferences(references: Reference[] | undefined) {
  if (!references || references.length === 0) return placeholderValue()
  const values = references
    .map((reference) => formatReference(reference))
    .filter((value) => value !== placeholderValue())
  return values.length > 0 ? values.join(', ') : placeholderValue()
}

function formatCodeableConcepts(concepts: CodeableConcept[] | undefined) {
  if (!concepts || concepts.length === 0) return placeholderValue()
  const values = concepts.map(getCodeableConceptText).filter(Boolean)
  return values.length > 0 ? values.join(', ') : placeholderValue()
}

function formatIdentifier(identifier: Identifier | undefined) {
  return identifier?.value || ''
}

function formatIdentifiers(identifiers: Identifier[] | undefined) {
  if (!identifiers || identifiers.length === 0) return placeholderValue()
  const values = identifiers.map(formatIdentifier).filter(Boolean)
  return values.length > 0 ? values.join(', ') : placeholderValue()
}

function formatContextPeriod(documentReference: DocumentReference) {
  const start = documentReference.context?.period?.start
  const end = documentReference.context?.period?.end
  if (!start && !end) return placeholderValue()
  if (start && end) return `${formatDate(start)} to ${formatDate(end)}`
  if (start) return `From ${formatDate(start)}`
  return `Through ${formatDate(end)}`
}

function formatAttester(composition: Composition | undefined) {
  if (!composition?.attester?.length) return placeholderValue()
  return composition.attester
    .map((attester) =>
      [
        attester.mode || '',
        attester.party?.display || attester.party?.reference || '',
        attester.time ? formatDate(attester.time) : '',
      ].filter(Boolean).join(', '),
    )
    .join(', ')
}

function getCombinedIdentifiers(
  composition: Composition | undefined,
  documentReference: DocumentReference,
) {
  const allIdentifiers = [
    ...(composition?.identifier ? [composition.identifier] : []),
    ...(documentReference.identifier ?? []),
  ]
  const seen = new Set<string>()
  return allIdentifiers.filter((identifier) => {
    const key = formatIdentifier(identifier)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildDocumentDetailsRows(
  documentReference: DocumentReference,
  composition: Composition | undefined,
): DetailRow[] {
  const adiDocument = composition ? readAdiDocument(composition, documentReference) : null
  const compositionCategories = formatCodeableConcepts(composition?.category)
  const compositionSubject = formatReference(composition?.subject)
  const compositionAuthor = formatReferences(composition?.author)
  const compositionCustodian = formatReference(composition?.custodian)

  // Prefer the clinical document's values; DocumentReference remains a generic fallback index.
  return [
    { label: 'Status', value: composition?.status || documentReference.docStatus || documentReference.status || placeholderValue() },
    { label: 'Version', value: adiDocument?.versionNumber || placeholderValue() },
    { label: 'Title', value: composition?.title || placeholderValue() },
    { label: 'Type', value: getCodeableConceptText(composition?.type) || getCodeableConceptText(documentReference.type) || placeholderValue() },
    { label: 'Category', value: compositionCategories !== placeholderValue() ? compositionCategories : formatCodeableConcepts(documentReference.category) },
    { label: 'Subject', value: compositionSubject !== placeholderValue() ? compositionSubject : formatReference(documentReference.subject) },
    { label: 'Author', value: compositionAuthor !== placeholderValue() ? compositionAuthor : formatReferences(documentReference.author) },
    { label: 'Facilitator', value: adiDocument ? formatReferences(adiDocument.facilitators) : placeholderValue() },
    { label: 'Data enterer', value: adiDocument ? formatReference(adiDocument.dataEnterer) : placeholderValue() },
    { label: 'Attester', value: formatAttester(composition) },
    { label: 'Authenticator', value: formatReference(documentReference.authenticator) },
    { label: 'Custodian', value: compositionCustodian !== placeholderValue() ? compositionCustodian : formatReference(documentReference.custodian) },
    { label: 'Date', value: formatDate(composition?.date || documentReference.date) },
    { label: 'Description', value: documentReference.description || placeholderValue() },
    { label: 'Master identifier', value: formatIdentifiers(documentReference.masterIdentifier ? [documentReference.masterIdentifier] : undefined) },
    { label: 'Identifier(s)', value: formatIdentifiers(getCombinedIdentifiers(composition, documentReference)) },
    { label: 'Context period', value: formatContextPeriod(documentReference) },
    { label: 'Security label', value: formatCodeableConcepts(documentReference.securityLabel) },
  ]
}

function getDocumentComposition(bundle: Bundle) {
  return bundle.entry
    ?.map((entry) => entry.resource)
    .find((resource): resource is Composition => resource?.resourceType === 'Composition') || null
}

function isBinary(resource: Resource | undefined): resource is Binary {
  return resource?.resourceType === 'Binary'
}

function isDocumentReference(resource: Resource | undefined): resource is DocumentReference {
  return resource?.resourceType === 'DocumentReference'
}

export function getBundlePdfViewers(
  bundle: Bundle,
  composition: Composition,
  baseUrl: string,
) {
  const viewers: AttachmentViewer[] = []
  const seenLabels = new Set<string>()
  const bundleIndex = createBundleIndex(bundle, baseUrl)
  const addViewer = (viewer: AttachmentViewer | null) => {
    if (viewer && !seenLabels.has(viewer.label)) {
      viewers.push(viewer)
      seenLabels.add(viewer.label)
    }
  }

  // Source PDFs may be direct Binary entries, DocumentReference attachments, or contained Binaries.
  for (const section of composition.section ?? []) {
    for (const entry of section.entry ?? []) {
      const resource = bundleIndex.resolve(entry.reference, composition)
      if (isBinary(resource)) {
        addViewer(createBinaryViewer(section.title || 'View PDF', resource))
      }
      if (isDocumentReference(resource)) {
        for (const contentItem of resource.content ?? []) {
          addViewer(createAttachmentViewer(
            contentItem.attachment?.title || section.title || 'View PDF',
            contentItem.attachment,
          ))
        }
      }
      for (const contained of (resource as Resource & { contained?: Resource[] } | undefined)?.contained ?? []) {
        if (isBinary(contained)) {
          addViewer(createBinaryViewer(section.title || 'View PDF', contained))
        }
      }
    }
  }
  return viewers
}

export function getReferencedBundleUrl(
  documentReference: DocumentReference,
  baseUrl: string,
) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  for (const contentItem of documentReference.content ?? []) {
    const url = contentItem.attachment?.url?.trim()
    if (!url) continue
    if (url.startsWith('Bundle/')) return url
    if (url.startsWith('/Bundle/')) return url.slice(1)
    if (url.startsWith(`${normalizedBaseUrl}/Bundle/`)) return url
  }
  return ''
}

export function buildBundleDerivedData(
  bundle: Bundle,
  baseUrl: string,
): BundleDerivedData | null {
  const composition = getDocumentComposition(bundle)
  if (!composition) return null
  return { composition, pdfViewers: getBundlePdfViewers(bundle, composition, baseUrl) }
}
