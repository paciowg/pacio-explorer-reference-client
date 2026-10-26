/** Resolves source-server references into a closed, version-aware SMP snapshot without altering source resources. */
import type { Bundle, DomainResource, List, MedicationStatement, Patient, Resource } from 'fhir/r4'
import { buildSmpCollection, uuidIdentifier, validateSmpMedicationList } from '../../igs/pacioSmp/smp'
import { readServerResource, serverResourceUrl } from '../../lib/fhir/resourceTransport'
import { normalizeBaseUrl } from '../../lib/fhir/url'

export function sourceReference(baseUrl: string, reference: string) {
  return serverResourceUrl(baseUrl, reference).slice(normalizeBaseUrl(baseUrl).length + 1)
}

export function samePatient(baseUrl: string, patientId: string, reference: string | undefined) {
  if (!reference) return false
  try { return sourceReference(baseUrl, reference).replace(/\/_history\/[^/]+$/, '') === `Patient/${patientId}` } catch { return false }
}

type Node = Record<string, unknown>
export function walkReferences(resource: Resource, visit: (node: Node, owner: Resource, path: string) => void) {
  function walk(value: unknown, owner: Resource, path: string, contained = false) {
    if (Array.isArray(value)) { value.forEach((v, i) => walk(v, owner, `${path}[${i}]`, contained)); return }
    if (!value || typeof value !== 'object') return
    const node = value as Node
    const scope = typeof node.resourceType === 'string' && !contained ? node as unknown as Resource : owner
    if ('reference' in node || (node.identifier && !node.resourceType && Object.keys(node).every((k) => ['identifier', 'type', 'display', 'extension', 'id'].includes(k)))) visit(node, owner, path)
    for (const [key, child] of Object.entries(node)) walk(child, scope, path ? `${path}.${key}` : key, key === 'contained')
  }
  walk(resource, resource, '')
}

export type PreparedSnapshot = { bundle: Bundle; originals: Map<string, Resource>; patient: Patient; readReferences?: Map<string, string> }

export class SmpSourceChangedError extends Error {}

export function sameResourceContent(a: Resource, b: Resource) {
  const normalized = (value: unknown): unknown => Array.isArray(value) ? value.map(normalized) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalized(child)])) : value
  return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b))
}

export async function prepareSmpSnapshot(baseUrl: string, patient: Patient, lists: List[], limit = 500): Promise<PreparedSnapshot> {
  if (!patient.id || !lists.length) throw new Error('Select at least one saved medication List.')
  const originals = new Map<string, Resource>()
  const aliases = new Map<string, Resource>()
  const readReferences = new Map<string, string>()
  const fullUrls = new Map<Resource, string>()
  function include(reference: string, resource: Resource) {
    const logical = sourceReference(baseUrl, reference).replace(/\/_history\/[^/]+$/, '')
    if (!resource.id || `${resource.resourceType}/${resource.id}` !== logical) throw new Error(`Unexpected resource returned for ${reference}.`)
    const requestedVersion = reference.match(/\/_history\/([^/]+)$/)?.[1]
    if (requestedVersion && resource.meta?.versionId !== requestedVersion) throw new Error(`Version unavailable: ${reference}.`)
    const prior = originals.get(logical)
    if (prior && !sameResourceContent(prior, resource)) throw new Error(`Conflicting versions of ${logical}. Select compatible Lists.`)
    if (!prior) {
      if (originals.size >= limit) throw new Error(`Collection exceeds the ${limit}-resource safety limit.`)
      originals.set(logical, structuredClone(resource))
    }
    const kept = originals.get(logical)!
    const key = sourceReference(baseUrl, reference)
    aliases.set(key, kept)
    // A historical read must not satisfy a later unversioned reference without checking the current resource.
    if (!readReferences.has(logical) || !requestedVersion) readReferences.set(logical, key)
    if (kept.meta?.versionId) aliases.set(`${logical}/_history/${kept.meta.versionId}`, kept)
    return kept
  }
  // Selection order determines List order; re-read selected Lists so a changed List cannot be silently published.
  for (const list of lists) {
    const ref = `List/${list.id}`
    const current = await readServerResource(baseUrl, ref)
    if (!sameResourceContent(current, list)) throw new SmpSourceChangedError(`${ref} changed. Choices are refreshing; review and submit again.`)
    include(ref, current)
  }
  include(`Patient/${patient.id}`, patient)
  const queue = [...originals.values()]
  const visited = new Set<Resource>()
  while (queue.length) {
    const resource = queue.shift()!
    if (visited.has(resource)) continue
    visited.add(resource)
    const refs: { node: Node; owner: Resource; path: string }[] = []
    walkReferences(resource, (node, owner, path) => refs.push({ node, owner, path }))
    for (const { node, owner, path } of refs) {
      const ref = node.reference
      if (typeof ref !== 'string' || !ref) throw new Error(`${resource.resourceType}/${resource.id} ${path}: identifier-only or empty reference prevents a closed snapshot.`)
      if (ref.startsWith('#')) {
        if (ref !== '#' && !(owner as DomainResource).contained?.some((r) => `#${r.id}` === ref)) throw new Error(`Unresolved contained reference: ${ref}.`)
        continue
      }
      // Source searches do not provide a Bundle context for UUID-only references.
      if (ref.startsWith('urn:')) throw new Error(`Unresolved source Bundle reference: ${ref}.`)
      let key: string
      try { key = sourceReference(baseUrl, ref) } catch { throw new Error(`External or unsupported reference prevents portability: ${ref}.`) }
      const logical = key.replace(/\/_history\/[^/]+$/, '')
      if (logical.startsWith('Patient/') && logical !== `Patient/${patient.id}`) throw new Error(`Another patient is referenced: ${ref}.`)
      if (!aliases.has(key)) {
        const loaded = include(key, await readServerResource(baseUrl, key))
        if (!visited.has(loaded)) queue.push(loaded)
      }
    }
  }
  const resolve = (ref: string | undefined, owner?: Resource) => {
    if (!ref) return undefined
    if (ref === '#') return owner
    if (ref.startsWith('#')) return (owner as DomainResource | undefined)?.contained?.find((r) => `#${r.id}` === ref)
    try { return aliases.get(sourceReference(baseUrl, ref)) } catch { return undefined }
  }
  const patientMatches = (ref: string | undefined) => samePatient(baseUrl, patient.id!, ref)
  for (const resource of originals.values()) {
    let issues: ReturnType<typeof validateSmpMedicationList> = []
    // Imported statement compatibility is not a publication gate; membership, identity, and closure still are.
    if (resource.resourceType === 'List') issues = validateSmpMedicationList(resource as List, patientMatches, resolve, { validateStatements: false })
    if (resource.resourceType === 'MedicationStatement' && !patientMatches((resource as MedicationStatement).subject?.reference)) throw new Error(`MedicationStatement/${resource.id} does not identify the selected patient.`)
    if (issues?.length) throw new Error(issues.map((i) => `${i.resource} ${i.path}: ${i.message}`).join(' '))
    fullUrls.set(resource, `urn:uuid:${crypto.randomUUID()}`)
  }
  const entries = [...originals.values()].map((resource) => {
    const copy = structuredClone(resource)
    walkReferences(copy, (node) => {
      const ref = node.reference as string
      if (!ref.startsWith('#')) node.reference = fullUrls.get(resolve(ref)!)
    })
    return { fullUrl: fullUrls.get(resource)!, resource: copy }
  })
  return { patient: structuredClone(patient), originals, readReferences, bundle: buildSmpCollection({ identifier: uuidIdentifier(), timestamp: new Date().toISOString(), entries }) }
}

export async function assertSnapshotUnchanged(baseUrl: string, snapshot: PreparedSnapshot) {
  for (const [ref, original] of snapshot.originals) {
    const versionRef = snapshot.readReferences?.get(ref) || ref
    const current = await readServerResource(baseUrl, versionRef)
    if (!sameResourceContent(current, original)) throw new SmpSourceChangedError(`${ref} changed. Choices are refreshing; review before publication.`)
  }
}
