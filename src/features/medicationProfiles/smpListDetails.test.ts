/** Verifies the shared live List loader preserves readable members while rejecting cross-patient content. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { List, Medication, MedicationStatement, Patient, Practitioner, PractitionerRole, Resource } from 'fhir/r4'
import { SMP_LIST } from '../../igs/pacioSmp/smp'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { loadSmpListDetails } from './smpListDetails'

const base = 'https://source.test/fhir'
const patient: Patient = { resourceType: 'Patient', id: 'p' }
const list: List = { resourceType: 'List', id: 'l', meta: { profile: [SMP_LIST] }, status: 'current', mode: 'snapshot', subject: { reference: 'Patient/p' }, source: { reference: 'PractitionerRole/r' }, entry: [{ item: { reference: 'MedicationStatement/s' } }] }
const statement: MedicationStatement = { resourceType: 'MedicationStatement', id: 's', status: 'active', subject: { reference: 'Patient/p' }, medicationReference: { reference: 'Medication/m' }, dosage: [{ text: 'One tablet daily' }] }
const medication: Medication = { resourceType: 'Medication', id: 'm', status: 'active', code: { text: 'Aspirin' } }
const role: PractitionerRole = { resourceType: 'PractitionerRole', id: 'r', practitioner: { reference: 'Practitioner/pr' } }
const practitioner: Practitioner = { resourceType: 'Practitioner', id: 'pr', name: [{ text: 'Alex Example' }] }

function mockReads(resources: Resource[]) {
  const fetch = vi.fn(async (url: string) => {
    const resource = resources.find((r) => url === `${base}/${r.resourceType}/${r.id}`)
    return new Response(JSON.stringify(resource || { issue: [{ diagnostics: 'Not available' }] }), { status: resource ? 200 : 404, headers: { 'Content-Type': 'application/fhir+json' } })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('live medication List details', () => {
  it('loads statements, Medications, and source practitioners with a resolver shared by inline and standalone views', async () => {
    mockReads([patient, statement, medication, role, practitioner])
    const data = await loadSmpListDetails(base, 'p', list)
    const resolve = createBundleIndex(data.bundle, base).resolve
    expect(resolve('MedicationStatement/s')).toMatchObject({ dosage: [{ text: 'One tablet daily' }] })
    expect(resolve('Medication/m')).toMatchObject({ code: { text: 'Aspirin' } })
    expect(resolve('Practitioner/pr')).toMatchObject({ name: [{ text: 'Alex Example' }] })
    expect(data.warning).toBe('')
  })
  it('retains usable statement data when a related Medication is unavailable', async () => {
    mockReads([patient, statement, role, practitioner])
    const data = await loadSmpListDetails(base, 'p', list)
    expect(createBundleIndex(data.bundle, base).resolve('MedicationStatement/s')).toBeDefined()
    expect(data.warning).toContain('Not available')
  })
  it('rejects another patient’s List before reads and excludes another patient’s statement', async () => {
    const fetch = mockReads([patient, { ...statement, subject: { reference: 'Patient/other' } } as MedicationStatement, role, practitioner])
    await expect(loadSmpListDetails(base, 'p', { ...list, subject: { reference: 'Patient/other' } })).rejects.toThrow('selected patient')
    expect(fetch).not.toHaveBeenCalled()
    const data = await loadSmpListDetails(base, 'p', list)
    expect(createBundleIndex(data.bundle, base).resolve('MedicationStatement/s')).toBeUndefined()
    expect(data.warning).toContain('another patient')
  })
})
