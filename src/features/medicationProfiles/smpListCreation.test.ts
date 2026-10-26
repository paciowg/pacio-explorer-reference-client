/** Verifies permissive List saves, source freshness, required authored fields, and safe write failure recovery. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MedicationStatement, Patient, PractitionerRole } from 'fhir/r4'
import { saveSmpMedicationList, type SmpListCreationInput, type SmpListSaveProgress } from './smpListCreation'
import { SmpSourceChangedError } from './smpReferences'

const baseUrl = 'https://source.test/fhir'
const patient: Patient = { resourceType: 'Patient', id: 'p', name: [{ text: 'Pat Example' }] }
const statement = { resourceType: 'MedicationStatement', id: 's', status: 'entered-in-error', subject: { reference: 'Patient/p' }, medicationReference: { reference: 'Medication/unavailable' } } as MedicationStatement
const author: PractitionerRole = { resourceType: 'PractitionerRole', id: 'author' }
function input(): SmpListCreationInput {
  return { baseUrl, patientId: 'p', identifier: { system: 'urn:ietf:rfc:3986', value: 'urn:uuid:5c41a001-5555-4444-8888-555555555555' },
    title: 'Medication review', typeCode: '104203-5', date: '2026-10-26', notes: '', author: 'PractitionerRole/author', selected: ['MedicationStatement/s'],
    choices: { patient, options: [{ reference: 'MedicationStatement/s', display: 'Reported medication', label: 'Reported medication — entered-in-error', resource: statement }],
      authors: [{ reference: 'PractitionerRole/author', display: 'Alex Example', label: 'PractitionerRole: Alex Example', resource: author }], bundle: { resourceType: 'Bundle', type: 'collection' } } }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/fhir+json' } })
function readsAndWrite(status = 201, changed = false) {
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') return status === 201 ? json({ ...JSON.parse(options.body as string), id: 'saved' }, 201) : json({ issue: [{ diagnostics: 'Write failed' }] }, status)
    if (url.endsWith('/MedicationStatement/s')) return json(changed ? { ...statement, status: 'active' } : statement)
    if (url.endsWith('/PractitionerRole/author')) return json(author)
    throw new Error(`Unexpected read: ${url}`)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('medication List creation', () => {
  it('saves imported statements without medication lookups or source-resource modifications', async () => {
    const fetch = readsAndWrite()
    const before = structuredClone(statement)
    const progress: SmpListSaveProgress = {}
    const saved = await saveSmpMedicationList(input(), progress)
    expect(saved.entry).toEqual([{ item: { reference: 'MedicationStatement/s', display: 'Reported medication' } }])
    expect(saved.source?.display).toBe('Alex Example')
    expect(saved.id).toBe('saved')
    expect(statement).toEqual(before)
    const posts = fetch.mock.calls.filter(([, options]) => options?.method === 'POST')
    expect(posts.map(([url]) => url)).toEqual([`${baseUrl}/List`])
    expect(fetch.mock.calls.some(([url]) => url.includes('/Medication/'))).toBe(false)
    await saveSmpMedicationList(input(), progress)
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  })
  it('requests automatic choice refresh after a changed or missing selection and does not write', async () => {
    const fetch = readsAndWrite(201, true)
    await expect(saveSmpMedicationList(input(), {})).rejects.toBeInstanceOf(SmpSourceChangedError)
    await expect(saveSmpMedicationList({ ...input(), selected: ['MedicationStatement/missing'] }, {})).rejects.toBeInstanceOf(SmpSourceChangedError)
    expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  })
  it('retains patient scoping and explicit empty reason requirements', async () => {
    const fetch = readsAndWrite()
    const wrong = input()
    wrong.choices.options[0].resource = { ...statement, subject: { reference: 'Patient/other' } } as MedicationStatement
    await expect(saveSmpMedicationList(wrong, {})).rejects.toThrow('current patient')
    await expect(saveSmpMedicationList({ ...input(), selected: [] }, {})).rejects.toThrow('explicit empty reason')
    expect(fetch).not.toHaveBeenCalled()
    const empty = await saveSmpMedicationList({ ...input(), selected: [], emptyReason: 'unavailable' }, {})
    expect(empty.emptyReason?.coding?.[0].code).toBe('unavailable')
  })
  it('allows retry after a definite rejection and blocks retry after an uncertain write', async () => {
    readsAndWrite(422)
    const rejected: SmpListSaveProgress = {}
    await expect(saveSmpMedicationList(input(), rejected)).rejects.toThrow('Write failed')
    expect(rejected.list).toBeUndefined()
    expect(rejected.uncertain).toBeUndefined()
    readsAndWrite()
    expect((await saveSmpMedicationList(input(), rejected)).id).toBe('saved')
    const fetch = readsAndWrite(500)
    const uncertain: SmpListSaveProgress = {}
    await expect(saveSmpMedicationList(input(), uncertain)).rejects.toThrow('Write failed')
    expect(uncertain.uncertain).toBe(true)
    const calls = fetch.mock.calls.length
    await expect(saveSmpMedicationList(input(), uncertain)).rejects.toThrow('uncertain')
    expect(fetch).toHaveBeenCalledTimes(calls)
  })
})
