/** Checks permissive SMP statement selection, optional label enrichment, complete searches, and role-preferred choices. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentReference, List, MedicationStatement, Patient, Practitioner, PractitionerRole, Resource } from 'fhir/r4'
import { SMP_LIST, SMP_TYPE } from '../../igs/pacioSmp/smp'
import { completeSearch, loadSmpChoices, loadSmpDocuments } from './smpData'

const base = 'https://source.test/fhir'
const patient: Patient = { resourceType: 'Patient', id: 'p', name: [{ text: 'Pat Example' }] }
const statement: MedicationStatement = { resourceType: 'MedicationStatement', id: 's', status: 'not-taken', medicationCodeableConcept: { text: 'Aspirin' }, subject: { reference: 'Patient/p' }, dateAsserted: '2026-10-01' }
const list: List = { resourceType: 'List', id: 'l', status: 'current', mode: 'snapshot', meta: { profile: [SMP_LIST] }, code: { text: 'Medication list' }, subject: { reference: 'Patient/p' }, source: { reference: 'PractitionerRole/r' }, entry: [{ item: { reference: 'MedicationStatement/s' } }] }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/fhir+json' } })
const search = (resources: Resource[]) => json({ resourceType: 'Bundle', type: 'searchset', entry: resources.map((resource) => ({ resource })) })
afterEach(() => vi.unstubAllGlobals())

describe('SMP search and selection', () => {
  it('offers undeclared and entered-in-error statements for this patient and prefers roles', async () => {
    const practitioner: Practitioner = { resourceType: 'Practitioner', id: 'paired', name: [{ text: 'Alex Example' }] }
    const unpaired: Practitioner = { ...practitioner, id: 'unpaired' }
    const role: PractitionerRole = { resourceType: 'PractitionerRole', id: 'r', practitioner: { reference: `${base}/Practitioner/paired/_history/1` }, code: [{ text: 'Physician' }] }
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/Patient/p')) return json(patient)
      if (url.includes('/MedicationStatement?')) return search([statement, { ...statement, id: 'bad', status: 'entered-in-error' } as MedicationStatement, { ...statement, id: 'other', subject: { reference: 'Patient/other' } } as MedicationStatement])
      if (url.includes('/Practitioner?')) return search([practitioner, unpaired])
      if (url.includes('/PractitionerRole?')) return search([role])
      return search([])
    })
    vi.stubGlobal('fetch', fetch)
    const result = await loadSmpChoices(base, 'p', 'list')
    expect(result.options.map((o) => o.reference)).toEqual(['MedicationStatement/s', 'MedicationStatement/bad'])
    expect(result.options[0].resource.meta?.profile).toBeUndefined()
    expect(result.authors.map((a) => a.reference).sort()).toEqual(['Practitioner/unpaired', 'PractitionerRole/r'])
    expect(result.authors.find((a) => a.reference === 'PractitionerRole/r')?.label).toBe('PractitionerRole: Alex Example — Physician')
    expect(fetch.mock.calls.every(([url]) => !url.includes('$everything'))).toBe(true)
  })
  it('keeps incomplete statements and unavailable Medications selectable without conformance labels', async () => {
    const incomplete = { resourceType: 'MedicationStatement', id: 'incomplete', subject: { reference: 'Patient/p' } } as MedicationStatement
    const unresolved: MedicationStatement = { ...statement, id: 'unresolved', medicationCodeableConcept: undefined, medicationReference: { reference: 'Medication/missing', display: 'Reported medication' } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/Patient/p')) return json(patient)
      if (url.includes('/MedicationStatement?')) return search([incomplete, unresolved])
      if (url.endsWith('/Medication/missing')) return json({ issue: [{ diagnostics: 'Medication unavailable' }] }, 404)
      return search([])
    }))
    const result = await loadSmpChoices(base, 'p', 'list')
    expect(result.options.map((o) => o.display)).toEqual(['incomplete', 'Reported medication'])
    expect(result.options[0].label).toBe('incomplete')
    expect(result.options[1].label).toBe('Reported medication — not-taken')
    expect(result.options.map((o) => o.resource)).toEqual([incomplete, unresolved])
  })
  it('requires complete searches, follows pagination, and deduplicates repeated resources', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => json({ resourceType: 'Bundle', type: 'searchset', entry: [{ resource: statement }], ...(url.includes('page=2') ? {} : { link: [{ relation: 'next', url: `${base}?page=2` }] }) })))
    expect(await completeSearch(base, 'MedicationStatement')).toHaveLength(1)
    vi.stubGlobal('fetch', vi.fn(async () => json({ resourceType: 'Bundle', type: 'searchset', entry: Array.from({ length: 500 }, () => ({ resource: statement })), link: [{ relation: 'next', url: `${base}?page=2` }] })))
    await expect(completeSearch(base, 'MedicationStatement')).rejects.toThrow('incomplete')
  })
  it('preserves readable Lists when collection indexing searches fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/List?') ? search([list, { ...list, id: 'wrong', subject: { reference: 'https://outside.test/Patient/p' } } as List]) : json({ issue: [{ diagnostics: 'Index search failed' }] }, 503)))
    const documents = await loadSmpDocuments(base, 'p')
    expect(documents.lists?.map((l) => l.id)).toEqual(['l'])
    expect(documents.indexes).toBeNull()
    expect(documents.indexError).toContain('Index search failed')
    expect(documents.listError).toBe('')
  })
  it('recognizes SMP indexes by the exact official coding and independently checks their patient', async () => {
    const index = { resourceType: 'DocumentReference', id: 'd', status: 'current', subject: { reference: 'Patient/p' }, type: { coding: [SMP_TYPE] }, content: [{ attachment: { contentType: 'application/fhir+json', url: 'Bundle/b' } }] }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/List?') ? search([]) : search([index, { ...index, id: 'generic', type: { coding: [{ code: SMP_TYPE.code, system: 'https://wrong.test' }] } } as DocumentReference, { ...index, id: 'other', subject: { reference: 'Patient/other' } } as DocumentReference])))
    expect((await loadSmpDocuments(base, 'p')).indexes?.map((d) => d.id)).toEqual(['d'])
  })
})
