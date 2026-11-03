/** Prepares destination document envelopes and captured references without fetching or refreshing clinical content. */
import type { Bundle, DocumentReference, Patient, Reference, Resource } from 'fhir/r4'
import { createBundleIndex } from './bundleIndex'
import { walkReferences } from './bundleReferences'

/** Keeps standalone Patient demographics while leaving source relationships in the captured Bundle. */
export function portableDocumentPatient(patient: Patient): Patient {
  const copy = structuredClone(patient)
  delete copy.id
  delete copy.meta
  const isContained = (reference: Reference | undefined) => reference?.reference?.startsWith('#')
  if (!isContained(copy.managingOrganization)) delete copy.managingOrganization
  if (copy.generalPractitioner) {
    copy.generalPractitioner = copy.generalPractitioner.filter(isContained)
    if (!copy.generalPractitioner.length) delete copy.generalPractitioner
  }
  if (copy.link) {
    copy.link = copy.link.filter((link) => isContained(link.other))
    if (!copy.link.length) delete copy.link
  }
  for (const contact of copy.contact || []) if (!isContained(contact.organization)) delete contact.organization
  assertContainedReferences(copy)
  if (copy.contact) {
    copy.contact = copy.contact.filter((contact) => contact.name || contact.telecom?.length || contact.address || contact.organization)
    if (!copy.contact.length) delete copy.contact
  }
  return copy
}

function assertContainedReferences(resource: Resource) {
  const index = createBundleIndex({ resourceType: 'Bundle', type: 'collection' })
  walkReferences(resource, (node, owner, path) => {
    const ref = node.reference
    if (typeof ref !== 'string' || !ref.startsWith('#') || (ref !== '#' && !index.resolve(ref, owner))) {
      throw new Error(`Unsupported destination ${resource.resourceType} reference at ${path}: ${ref || 'Identifier-only reference'}.`)
    }
  })
}

/** Matches direct cross-server creation: participant identities remain inside the snapshot, not its index. */
export function portableDocumentIndex(document: DocumentReference): DocumentReference {
  const copy = structuredClone(document)
  delete copy.author
  delete copy.authenticator
  delete copy.custodian
  const subject = copy.subject
  delete copy.subject
  assertContainedReferences(copy)
  copy.subject = subject
  return copy
}

/** Retains existing UUID identities and converts other captured identities into Bundle-local references. */
export function portableCapturedBundle(bundle: Bundle, sourceBase: string): Bundle {
  const copy = structuredClone(bundle)
  const index = createBundleIndex(copy, sourceBase)
  const fullUrls = new Map((copy.entry || []).flatMap((entry) => entry.resource && entry.fullUrl ? [[entry.fullUrl, entry.resource] as const] : []))
  const urls = new Map<Resource, string>()
  for (const entry of copy.entry || []) {
    if (!entry.resource) throw new Error('The saved Bundle contains an unavailable resource.')
    urls.set(entry.resource, entry.fullUrl?.startsWith('urn:uuid:') ? entry.fullUrl : `urn:uuid:${crypto.randomUUID()}`)
  }
  for (const entry of copy.entry || []) {
    walkReferences(entry.resource!, (node, owner) => {
      const ref = node.reference
      if (typeof ref !== 'string') throw new Error('Identifier-only reference prevents a portable document.')
      if (ref.startsWith('#')) {
        if (ref !== '#' && !index.resolve(ref, owner)) throw new Error(`Unresolved contained reference: ${ref}.`)
        return
      }
      const version = ref.match(/\/_history\/([^/]+)$/)
      const exact = fullUrls.get(ref)
      const target = exact || index.resolve(version ? ref.slice(0, version.index) : ref, owner)
      if (!target || (!exact && version && target.meta?.versionId !== version[1])) throw new Error(`Unresolved captured reference: ${ref}.`)
      node.reference = urls.get(target)
    })
  }
  for (const entry of copy.entry || []) entry.fullUrl = urls.get(entry.resource!)
  return copy
}
