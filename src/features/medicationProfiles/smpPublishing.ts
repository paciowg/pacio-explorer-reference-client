/** Coordinates read-only destination matching and staged SMP writes with explicit uncertain-outcome recovery. */
import type { Bundle, CapabilityStatement, DocumentReference, List, Patient, Reference, Resource } from 'fhir/r4'
import { buildSmpDocumentReference } from '../../igs/pacioSmp/smp'
import { validateFhirServer } from '../../lib/fhir/client'
import { normalizeBaseUrl } from '../../lib/fhir/url'
import { serverResourceUrl } from '../../lib/fhir/resourceTransport'
import { findDestinationPatient } from '../../lib/fhir/destinationPatient'
import { assertSnapshotUnchanged, sourceReference, type PreparedSnapshot } from './smpReferences'

export type DestinationMatch = { patient?: Patient; warning: string }
export type SmpProgress = { patient?: Patient; bundle?: Bundle; index?: DocumentReference; uncertain?: string; publicationKey?: string }
export class SmpWriteError extends Error {
  uncertain: boolean
  constructor(message: string, uncertain: boolean) { super(message); this.uncertain = uncertain }
}

export async function writeSmpResource<T extends Resource>(baseUrl: string, resource: T): Promise<T> {
  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/${resource.resourceType}`, { method: 'POST', cache: 'no-store',
      headers: { Accept: 'application/fhir+json', 'Content-Type': 'application/fhir+json', Prefer: 'return=representation' }, body: JSON.stringify(resource) })
    const raw = await response.text()
    let body: Resource | { issue?: { diagnostics?: string; details?: { text?: string } }[] } | null = null
    try { body = raw ? JSON.parse(raw) : null } catch { throw new SmpWriteError(`Unreadable ${resource.resourceType} response. Verify the destination before retrying.`, response.ok || response.status >= 500 || response.status === 408) }
    if (!response.ok) {
      const outcome = body as { issue?: { diagnostics?: string; details?: { text?: string } }[] } | null
      throw new SmpWriteError(outcome?.issue?.[0]?.diagnostics || outcome?.issue?.[0]?.details?.text || `FHIR write failed (${response.status}).`, response.status >= 500 || response.status === 408)
    }
    if (body && 'resourceType' in body && body.resourceType === resource.resourceType && /^[A-Za-z0-9.-]{1,64}$/.test(body.id || '')) return body as T
    const location = response.headers.get('location') || response.headers.get('content-location') || ''
    let reference = ''
    try { reference = serverResourceUrl(baseUrl, location).slice(normalizeBaseUrl(baseUrl).length + 1) } catch { /* An accepted write without a trustworthy identity must not be repeated. */ }
    const match = reference.match(new RegExp(`^${resource.resourceType}/([A-Za-z0-9.-]+)(?:/_history/[^/]+)?$`))
    if (!match) throw new SmpWriteError(`Server accepted ${resource.resourceType} without a usable same-server id. Verify the destination before retrying.`, true)
    return { ...resource, id: match[1] }
  } catch (error) {
    if (error instanceof SmpWriteError) throw error
    throw new SmpWriteError(error instanceof Error ? error.message : 'Write interrupted.', true)
  }
}

function capabilityWarnings(capability: CapabilityStatement, needsPatientCreate: boolean, needsPatientSearch = true) {
  const resources = capability.rest?.filter((r) => r.mode === 'server').flatMap((r) => r.resource || []) || []
  const warnings: string[] = []
  for (const [type, interaction] of [['Bundle', 'create'], ['DocumentReference', 'create'], ...(needsPatientSearch ? [['Patient', 'search-type']] : []), ...(needsPatientCreate ? [['Patient', 'create']] : [])]) {
    const resource = resources.find((r) => r.type === type)
    if (resource?.interaction && !resource.interaction.some((i) => i.code === interaction)) throw new Error(`Destination does not support ${interaction} on ${type}.`)
    if (!resource?.interaction) warnings.push(`Destination did not declare ${type} ${interaction} support.`)
  }
  return warnings.join(' ')
}

export async function matchSmpPatient(sourceBase: string, destinationBase: string, patient: Patient): Promise<DestinationMatch> {
  const capability = await validateFhirServer(destinationBase)
  if (normalizeBaseUrl(sourceBase) === normalizeBaseUrl(destinationBase)) return { patient, warning: capabilityWarnings(capability, false, false) }
  const matched = await findDestinationPatient({ sourceBaseUrl: sourceBase, destinationBaseUrl: destinationBase, patient })
  return { patient: matched || undefined, warning: capabilityWarnings(capability, !matched) }
}

export async function publishSmpCollection(input: { sourceBase: string; destinationBase: string; title: string; snapshot: PreparedSnapshot; match: DestinationMatch }, progress: SmpProgress) {
  if (progress.uncertain) throw new Error(`Verify the destination after the uncertain ${progress.uncertain} write before starting another submission.`)
  const publicationKey = JSON.stringify([normalizeBaseUrl(input.sourceBase), normalizeBaseUrl(input.destinationBase), input.title, input.snapshot.bundle, input.match.patient?.id])
  if (progress.publicationKey && publicationKey !== progress.publicationKey) throw new Error('Publication inputs changed. Start a new collection rather than reusing retained writes.')
  if (progress.index) return progress.index
  if (!progress.bundle) await assertSnapshotUnchanged(input.sourceBase, input.snapshot)
  progress.publicationKey = publicationKey
  let stage = 'Patient'
  try {
    if (!progress.patient) {
      const selected = input.match.patient
      if (selected) progress.patient = selected
      else {
        const copy = structuredClone(input.snapshot.patient)
        delete copy.id
        delete copy.meta
        progress.patient = await writeSmpResource(input.destinationBase, copy)
      }
    }
    stage = 'Bundle'
    if (!progress.bundle) progress.bundle = await writeSmpResource(input.destinationBase, input.snapshot.bundle)
    stage = 'DocumentReference'
    const firstList = input.snapshot.bundle.entry?.find((e) => e.resource?.resourceType === 'List')?.resource as List
    // Index author targets are narrower than List.source; never use source-local ids across servers.
    const originalList = [...input.snapshot.originals.values()].find((r) => r.resourceType === 'List') as List
    const source = originalList.source?.reference
    let author: Reference | undefined
    if (normalizeBaseUrl(input.sourceBase) === normalizeBaseUrl(input.destinationBase) && source && !source.startsWith('#')) {
      if (sourceReference(input.sourceBase, source).startsWith('PractitionerRole/')) author = originalList.source
    }
    if (!firstList || !progress.patient.id) throw new Error('Invalid destination patient.')
    progress.index = await writeSmpResource(input.destinationBase, buildSmpDocumentReference({
      identifier: input.snapshot.bundle.identifier!, title: input.title, timestamp: input.snapshot.bundle.timestamp!,
      patient: { reference: `Patient/${progress.patient.id}` }, bundleUrl: `${normalizeBaseUrl(input.destinationBase)}/Bundle/${progress.bundle.id}`, author,
    }))
    return progress.index
  } catch (error) {
    if (error instanceof SmpWriteError && error.uncertain) progress.uncertain = stage
    throw error
  }
}
