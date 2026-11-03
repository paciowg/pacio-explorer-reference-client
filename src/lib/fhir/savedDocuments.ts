/** Loads, validates, and sends saved FHIR snapshots without rebuilding their content or depending on profile-specific workflows. */
import type { Bundle, Composition, CompositionSection, DocumentReference, Patient, Reference, Resource } from 'fhir/r4'
import { createBundleIndex } from './bundleIndex'
import { loadDocumentDetails } from './documentDetails'
import { getReferencedBundleUrl } from './documentReferences'
import { matchDocumentPatient, publishPreparedDocument, type DocumentPublicationProgress } from './documentPublishing'
import { createResourceWithOutcome, serverResourceUrl } from './resourceTransport'
import { normalizeBaseUrl } from './url'
import { samePatient } from './destinationPatient'
import { walkReferences } from './bundleReferences'
import { portableCapturedBundle, portableDocumentIndex, portableDocumentPatient } from './documentPortability'

export type SavedDocument = { bundle: Bundle; documentReference: DocumentReference; patient: Patient; bundleReference: string }

/** FHIR documents require these Composition targets to be captured; other external links may remain external. */
function requiredCompositionReferences(composition: Composition): Reference[] {
  const sections = (items: CompositionSection[] = []): Reference[] => items.flatMap((section) => [
    ...(section.author || []), ...(section.focus ? [section.focus] : []), ...(section.entry || []), ...sections(section.section),
  ])
  return [
    ...(composition.subject ? [composition.subject] : []), ...(composition.encounter ? [composition.encounter] : []),
    ...composition.author, ...(composition.attester?.flatMap((attester) => attester.party ? [attester.party] : []) || []),
    ...(composition.custodian ? [composition.custodian] : []), ...(composition.event?.flatMap((event) => event.detail || []) || []),
    ...sections(composition.section),
  ]
}

/** Resolves captured references only, including exact fullUrls and version-qualified entry identities. */
export function savedDocumentResolver(bundle: Bundle, sourceBase: string) {
  const index = createBundleIndex(bundle, sourceBase)
  const fullUrls = new Map((bundle.entry || []).flatMap((entry) => entry.fullUrl && entry.resource ? [[entry.fullUrl, entry.resource] as const] : []))
  return (reference: string | undefined, owner?: Resource): Resource | undefined => {
    if (!reference) return undefined
    if (reference === '#') return owner
    if (reference.startsWith('#')) return index.resolve(reference, owner)
    const exact = fullUrls.get(reference)
    if (exact) return exact
    const version = reference.match(/\/_history\/([^/]+)$/)
    const resource = index.resolve(version ? reference.slice(0, version.index) : reference, owner)
    return version && resource?.meta?.versionId !== version[1] ? undefined : resource
  }
}

export function validateSavedDocument(data: SavedDocument, sourceBase: string, patientId: string) {
  const { bundle, documentReference, patient } = data
  if (!samePatient(sourceBase, patientId, documentReference.subject?.reference) || patient.id !== patientId) throw new Error('DocumentReference belongs to another patient.')
  const composition = bundle.entry?.[0]?.resource as Composition | undefined
  if (bundle.type !== 'document' && bundle.type !== 'collection') throw new Error('The saved Bundle must be a document or collection.')
  if (bundle.type === 'document' && composition?.resourceType !== 'Composition') throw new Error('A document Bundle with a leading Composition is required.')
  const resolve = savedDocumentResolver(bundle, sourceBase)
  const patients = bundle.entry?.flatMap((entry) => entry.resource?.resourceType === 'Patient' ? [entry.resource as Patient] : []) || []
  if (patients.length !== 1) throw new Error('The saved Bundle must contain exactly one Patient.')
  const captured = patients[0]
  const identifiersMatch = captured.identifier?.some((a) => a.system && a.value && patient.identifier?.some((b) => a.system === b.system && a.value === b.value))
  const namesMatch = captured.name?.some((a) => patient.name?.some((b) => (a.text && a.text === b.text) || (a.family && a.given?.[0] && a.family.toLocaleLowerCase() === b.family?.toLocaleLowerCase() && a.given[0].toLocaleLowerCase() === b.given?.[0]?.toLocaleLowerCase())))
  if (!identifiersMatch && !(namesMatch && (!captured.birthDate || !patient.birthDate || captured.birthDate === patient.birthDate))) {
    if (captured.id !== patient.id || (captured.name?.length && patient.name?.length) || (captured.birthDate && patient.birthDate && captured.birthDate !== patient.birthDate)) throw new Error('Captured patient does not match the indexed patient.')
  }
  if (bundle.type === 'document' && resolve(composition?.subject?.reference, composition) !== captured) throw new Error('Composition identifies a different patient.')
  if (bundle.type === 'document' && composition) {
    for (const reference of requiredCompositionReferences(composition)) {
      if (!resolve(reference.reference, composition)) throw new Error(`Unresolved Composition reference: ${reference.reference || 'Identifier-only reference'}.`)
    }
  }
  for (const { resource } of bundle.entry || []) {
    if (!resource) throw new Error('The saved Bundle contains an unavailable resource.')
    walkReferences(resource, (node, owner) => {
      const reference = node.reference
      // External references may remain external, but internal references must resolve without live reads.
      if (typeof reference !== 'string' || (!resolve(reference, owner) && !/^https?:\/\//.test(reference))) throw new Error(`Unresolved saved reference: ${reference || 'Identifier-only reference'}.`)
      if (!resolve(reference, owner) && reference.startsWith(`${normalizeBaseUrl(sourceBase)}/`)) throw new Error(`Unresolved saved reference: ${reference}.`)
      if (node === (resource as Composition).subject && /(?:^|\/)Patient\//.test(reference) && resolve(reference, owner) !== captured) throw new Error('Bundle contains mismatched patient references.')
    })
  }
}

export async function loadSavedDocument(sourceBase: string, patientId: string, resourceId: string): Promise<SavedDocument> {
  const loaded = await loadDocumentDetails(sourceBase, patientId, resourceId)
  if (!loaded.bundle) throw new Error('The saved Bundle is unavailable or does not have a supported same-server URL.')
  const data = { ...loaded, bundle: loaded.bundle }
  validateSavedDocument(data, sourceBase, patientId)
  return data
}

function forCreate<T extends Resource>(resource: T): T {
  const copy = structuredClone(resource)
  delete copy.id
  if (copy.meta) {
    delete copy.meta.versionId
    delete copy.meta.lastUpdated
    if (!Object.keys(copy.meta).length) delete copy.meta
  }
  return copy
}

export function destinationIndex(data: SavedDocument, sourceBase: string, patient: Patient, bundleUrl: string): DocumentReference {
  const index = forCreate(data.documentReference)
  index.subject = { ...index.subject, reference: `Patient/${patient.id}` }
  const sourceUrl = getReferencedBundleUrl(data.documentReference, sourceBase)
  index.content = index.content.map((content) => {
    const candidate = getReferencedBundleUrl({ ...data.documentReference, content: [content] }, sourceBase)
    if (candidate && serverResourceUrl(sourceBase, candidate) === serverResourceUrl(sourceBase, sourceUrl)) {
      const attachment = { ...content.attachment, url: bundleUrl }
      // Destination storage changes the outer resource envelope, so source byte hashes and sizes no longer apply.
      delete attachment.hash
      delete attachment.size
      return { ...content, attachment }
    }
    const copy = structuredClone(content)
    const url = copy.attachment.url
    if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('#')) copy.attachment.url = new URL(url, `${normalizeBaseUrl(sourceBase)}/`).href
    return copy
  })
  return portableDocumentIndex(index)
}

export async function sendSavedDocument(input: { sourceBase: string; destinationBase: string; data: SavedDocument }, progress: DocumentPublicationProgress) {
  const destination = normalizeBaseUrl(input.destinationBase)
  if (!destination || destination === normalizeBaseUrl(input.sourceBase)) throw new Error('Select another destination FHIR server.')
  validateSavedDocument(input.data, input.sourceBase, input.data.patient.id!)
  // Prepare and validate the index before any writes, including source-local metadata references.
  destinationIndex(input.data, input.sourceBase, { ...input.data.patient, id: 'pending' }, `${destination}/Bundle/pending`)
  const bundle = portableCapturedBundle(forCreate(input.data.bundle), input.sourceBase)
  const capturedPatient = input.data.bundle.entry!.find((entry) => entry.resource?.resourceType === 'Patient')!.resource as Patient
  return publishPreparedDocument({
    sourceBaseUrl: input.sourceBase,
    destinationBaseUrl: destination,
    bundle,
    ensurePatient: async () => {
      const match = await matchDocumentPatient(input.sourceBase, destination, capturedPatient)
      return match.patient || createResourceWithOutcome(destination, portableDocumentPatient(capturedPatient))
    },
    buildDocumentReference: (bundleUrl, patient) => destinationIndex(input.data, input.sourceBase, patient, bundleUrl),
  }, progress)
}
