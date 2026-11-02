/** Verifies editable List loading rejects identity mismatches and retains original selections missing from creation choices. */
import type { List, MedicationStatement } from 'fhir/r4'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SMP_LIST } from '../../igs/pacioSmp/smp'
import { loadSmpChoices, type SmpChoices } from './smpData'
import { loadSmpListEditData } from './smpListEditData'
import { existingEntryValue } from './smpListEditModel'

vi.mock('./smpData', async (original) => ({ ...await original<typeof import('./smpData')>(), loadSmpChoices: vi.fn() }))
const base = 'https://source.test/fhir'
const member: MedicationStatement = { resourceType: 'MedicationStatement', id: 's', status: 'active', subject: { reference: 'Patient/p' }, medicationCodeableConcept: { text: 'Existing medication' }, dateAsserted: '2026-10-23' }
const list: List = { resourceType: 'List', id: 'l', status: 'current', mode: 'snapshot', meta: { profile: [SMP_LIST] }, subject: { reference: 'Patient/p' },
  entry: [{ item: { reference: `${base}/MedicationStatement/s` } }, { item: { reference: 'MedicationStatement/missing', display: 'Unresolved medication' } },
    { item: { reference: '#contained' } }, { item: { identifier: { value: 'logical-id' } } }], contained: [{ ...member, id: 'contained' }] }
function choices(): SmpChoices {
  const options = [member, { ...member, id: 'new' }].map((resource) => ({ reference: `MedicationStatement/${resource.id}`, label: resource.id!, display: resource.id!, resource }))
  return { patient: { resourceType: 'Patient', id: 'p' }, authors: [], options, bundle: { resourceType: 'Bundle', type: 'collection', entry: options.map((option) => ({ resource: option.resource })) } }
}
function respond(resource: unknown = list) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(resource), { headers: { 'Content-Type': 'application/fhir+json' } }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
beforeEach(() => { vi.mocked(loadSmpChoices).mockReset().mockResolvedValue(choices()) })
afterEach(() => vi.unstubAllGlobals())

describe('List edit loading', () => {
  it('retains all original members, enriches available/contained members, and hides relative aliases from new choices', async () => {
    const fetch = respond()
    const loaded = await loadSmpListEditData(base, 'p', 'l')
    expect(loaded.original).toEqual(list)
    expect(loaded.memberOptions.map((option) => option.value)).toEqual(['MedicationStatement/new', ...list.entry!.map((_, index) => existingEntryValue(index))])
    expect(loaded.memberOptions[1]).toMatchObject({ label: 'Existing medication', dateValue: member.dateAsserted })
    expect(loaded.memberOptions[2].label).toContain('Unresolved medication (Existing; unavailable)')
    expect(loaded.memberOptions[3]).toMatchObject({ label: 'Existing medication', dateValue: member.dateAsserted })
    expect(loaded.memberOptions[4].label).toContain('logical-id')
    expect(fetch).toHaveBeenCalledOnce()
  })
  it.each([
    { ...list, id: 'different' }, { resourceType: 'Patient', id: 'l' },
    { ...list, subject: { reference: 'Patient/other' } }, { ...list, meta: undefined },
  ])('rejects the wrong identity, type, patient, or unrelated List', async (resource) => {
    respond(resource)
    await expect(loadSmpListEditData(base, 'p', 'l')).rejects.toThrow()
    expect(loadSmpChoices).not.toHaveBeenCalled()
  })
  it('rejects mismatched patient choices and propagates incomplete/failed choice loading', async () => {
    respond()
    vi.mocked(loadSmpChoices).mockResolvedValueOnce({ ...choices(), patient: { resourceType: 'Patient', id: 'other' } })
    await expect(loadSmpListEditData(base, 'p', 'l')).rejects.toThrow('requested Patient')
    vi.mocked(loadSmpChoices).mockRejectedValueOnce(new Error('Incomplete search'))
    await expect(loadSmpListEditData(base, 'p', 'l')).rejects.toThrow('Incomplete search')
  })
  it('keeps external, historical, and cross-patient members as original selections without treating them as new choices', async () => {
    respond({ ...list, entry: [{ item: { reference: 'https://external.test/fhir/MedicationStatement/s', display: 'External member' } },
      { item: { reference: 'MedicationStatement/s/_history/2', display: 'Historical member' } }, { item: { reference: 'MedicationStatement/foreign' } }] })
    const data = choices()
    const foreign: MedicationStatement = { ...member, id: 'foreign', subject: { reference: 'Patient/other' } }
    data.bundle.entry!.push({ resource: foreign })
    vi.mocked(loadSmpChoices).mockResolvedValueOnce(data)
    const loaded = await loadSmpListEditData(base, 'p', 'l')
    expect(loaded.memberOptions.slice(-3).every((option) => option.label.includes('Existing; unavailable'))).toBe(true)
    expect(loaded.original.entry).toHaveLength(3)
  })
})
