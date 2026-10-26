/** Exercises snapshot closure across overlapping Lists, reference forms, versions, patient boundaries, and cycles. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { List, Medication, MedicationStatement, Patient, Resource } from 'fhir/r4'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { prepareSmpSnapshot, samePatient } from './smpReferences'

const base = 'https://source.test/fhir'
const patient: Patient = { resourceType: 'Patient', id: 'p' }
const s: MedicationStatement = { resourceType: 'MedicationStatement', id: 's', meta: { versionId: '1' }, status: 'active', medicationCodeableConcept: { text: 'Aspirin' }, subject: { reference: `${base}/Patient/p` } }
const author: Resource = { resourceType: 'PractitionerRole', id: 'r' }
const list = (id: string, reference = 'MedicationStatement/s'): List => ({ resourceType: 'List', id, status: 'current', mode: 'snapshot', code: { text: 'Medication list' }, subject: { reference: 'Patient/p' }, source: { reference: 'PractitionerRole/r' }, entry: [{ item: { reference } }] })
function server(resources: Resource[]) {
  const fetch = vi.fn(async (url: string) => {
    const ref = url.replace(`${base}/`, '')
    const [type, id, , version] = ref.split('/')
    const resource = resources.find((r) => r.resourceType === type && r.id === id && (!version || r.meta?.versionId === version))
    return new Response(JSON.stringify(resource || { issue: [{ diagnostics: 'not found' }] }), { status: resource ? 200 : 404 })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('SMP closure', () => {
  it('preserves two List memberships but deduplicates shared statements and rewrites absolute/versioned references', async () => {
    const a = list('a'), b = list('b', `${base}/MedicationStatement/s/_history/1`)
    const fetch = server([a, b, s, author, patient])
    const original = structuredClone([a, b, s])
    const snapshot = await prepareSmpSnapshot(base, patient, [a, b])
    expect(snapshot.bundle.entry?.map((e) => e.resource?.resourceType)).toEqual(['List', 'List', 'Patient', 'PractitionerRole', 'MedicationStatement'])
    const lists = snapshot.bundle.entry!.filter((e) => e.resource?.resourceType === 'List').map((e) => e.resource as List)
    expect(lists[0].entry![0].item.reference).toBe(lists[1].entry![0].item.reference)
    expect(lists[0].entry![0].item.reference).toMatch(/^urn:uuid:/)
    const index = createBundleIndex(snapshot.bundle)
    expect(index.resolve(lists[0].entry![0].item.reference)?.resourceType).toBe('MedicationStatement')
    expect([a, b, s]).toEqual(original)
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/_history/1'))).toBe(false)
  })
  it('rejects another patient, an external reference, missing dependencies, and a closure over its limit', async () => {
    const a = list('a')
    server([a, { ...s, subject: { reference: 'Patient/other' } } as MedicationStatement, author, patient])
    await expect(prepareSmpSnapshot(base, patient, [a])).rejects.toThrow('Another patient')
    server([a, { ...s, basedOn: [{ reference: 'https://external.test/fhir/MedicationRequest/r' }] } as MedicationStatement, author, patient])
    await expect(prepareSmpSnapshot(base, patient, [a])).rejects.toThrow('External')
    server([a, author, patient])
    await expect(prepareSmpSnapshot(base, patient, [a])).rejects.toThrow('not found')
    server([a, s, author, patient])
    await expect(prepareSmpSnapshot(base, patient, [a], 2)).rejects.toThrow('safety limit')
  })
  it('captures statements with SMP compatibility issues without repairing or relabelling them', async () => {
    const a = list('a')
    const imported: MedicationStatement = { ...s, status: 'entered-in-error', medicationCodeableConcept: undefined, basedOn: [{ reference: 'CarePlan/plan' }] }
    server([a, imported, { resourceType: 'CarePlan', id: 'plan' }, author, patient])
    const before = structuredClone(imported)
    const snapshot = await prepareSmpSnapshot(base, patient, [a])
    const captured = snapshot.bundle.entry?.find((e) => e.resource?.resourceType === 'MedicationStatement')?.resource as MedicationStatement
    expect(captured.status).toBe('entered-in-error')
    expect(captured.medicationCodeableConcept).toBeUndefined()
    expect(captured.meta?.profile).toBeUndefined()
    expect(createBundleIndex(snapshot.bundle).resolve(captured.basedOn?.[0].reference)?.resourceType).toBe('CarePlan')
    expect(imported).toEqual(before)
  })
  it('still rejects a List member of the wrong resource type', async () => {
    const a = list('a', 'Observation/o')
    server([a, { resourceType: 'Observation', id: 'o' }, author, patient])
    await expect(prepareSmpSnapshot(base, patient, [a])).rejects.toThrow('MedicationStatements')
  })
  it('preserves contained scope and terminates cycles', async () => {
    const a = list('a')
    const contained: MedicationStatement = { ...s, medicationCodeableConcept: undefined, medicationReference: { reference: '#m' }, contained: [{ resourceType: 'Medication', id: 'm', status: 'active', code: { text: 'Aspirin' } } as Medication], derivedFrom: [{ reference: 'List/a' }] }
    server([a, contained, author, patient])
    const snapshot = await prepareSmpSnapshot(base, patient, [a])
    const stored = snapshot.bundle.entry?.find((e) => e.resource?.resourceType === 'MedicationStatement')?.resource as MedicationStatement
    expect(stored.medicationReference?.reference).toBe('#m')
    expect(createBundleIndex(snapshot.bundle).resolve('#m', stored)?.id).toBe('m')
  })
  it('rejects conflicting versions and changed selected Lists', async () => {
    const a = list('a'), b = list('b', 'MedicationStatement/s/_history/2')
    server([a, b, s, { ...s, meta: { versionId: '2' } }, author, patient])
    await expect(prepareSmpSnapshot(base, patient, [a, b])).rejects.toThrow('Conflicting versions')
    server([{ ...a, title: 'Changed' } as List, s, author, patient])
    await expect(prepareSmpSnapshot(base, patient, [a])).rejects.toThrow('changed')
  })
  it('does not use an older explicit version for a later unversioned reference', async () => {
    const a = list('a', 'MedicationStatement/s/_history/1'), b = list('b')
    server([a, b, { ...s, meta: { versionId: '2' } }, s, author, patient])
    await expect(prepareSmpSnapshot(base, patient, [a, b])).rejects.toThrow('Conflicting versions')
  })
  it('keeps sibling contained references in the containing resource scope', async () => {
    const a = list('a')
    const contained: MedicationStatement = { ...s, medicationCodeableConcept: undefined, medicationReference: { reference: '#m' }, contained: [
      { resourceType: 'Medication', id: 'm', status: 'active', code: { text: 'Aspirin' }, manufacturer: { reference: '#org' } } as Medication,
      { resourceType: 'Organization', id: 'org' },
    ] }
    server([a, contained, author, patient])
    const snapshot = await prepareSmpSnapshot(base, patient, [a])
    expect(snapshot.bundle.entry?.filter((e) => e.resource?.resourceType === 'Organization')).toHaveLength(0)
  })
  it('matches only local patient aliases', () => {
    expect(samePatient(base, 'p', `${base}/Patient/p/_history/2`)).toBe(true)
    expect(samePatient(base, 'p', 'https://other.test/fhir/Patient/p')).toBe(false)
  })
})
