/** Checks destination-local searches, explicit patient scoping, role preference, and request medication eligibility. */
import type { Condition, Medication, MedicationRequest, Patient, Resource } from 'fhir/r4'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalogMedication } from '../../igs/pacioSmp/medicationStatement'
import { loadStatementCreateData } from './statementCreateData'

const base = 'https://destination.test/fhir'
const patient: Patient = { resourceType: 'Patient', id: 'p' }
const request: MedicationRequest = { resourceType: 'MedicationRequest', id: 'r', status: 'active', intent: 'order', subject: { reference: 'Patient/p' }, medicationCodeableConcept: catalogMedication('313782') }
const medication: Medication = { resourceType: 'Medication', id: 'm', status: 'active', code: catalogMedication('313782') }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/fhir+json' } })
const bundle = (resources: Resource[]) => ({ resourceType: 'Bundle', type: 'searchset', entry: resources.map((resource) => ({ resource })) })
afterEach(() => vi.unstubAllGlobals())

describe('statement choices', () => {
  it('hides uncoded, external, contained, unresolved, and wrong-patient requests while resolving local Medication references', async () => {
    const requests = [request,
      { ...request, id: 'text', medicationCodeableConcept: { text: 'Free text' } },
      { ...request, id: 'other', subject: { reference: 'Patient/other' } },
      ...['Medication/m', `${base}/Medication/m/_history/1`, 'https://external.test/Medication/m', '#m', 'Medication/missing'].map((reference, index) => ({ ...request, id: `ref-${index}`, medicationCodeableConcept: undefined, medicationReference: { reference } })),
    ]
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/MedicationRequest?')) return json(bundle(requests))
      if (url.includes('/Medication?')) return json(bundle([medication]))
      if (url.endsWith('/Medication/m/_history/1')) return json({ ...medication, meta: { versionId: '1' } })
      if (url.endsWith('/Medication/missing')) return json({}, 404)
      if (url.includes('/Practitioner?')) return json(bundle([{ resourceType: 'Practitioner', id: 'pr' }]))
      if (url.includes('/PractitionerRole?')) return json(bundle([{ resourceType: 'PractitionerRole', id: 'role', practitioner: { reference: 'Practitioner/pr' } } as Resource]))
      if (url.includes('/Condition?')) return json(bundle([{ resourceType: 'Condition', id: 'good', subject: { reference: `${base}/Patient/p/_history/2` } }, { resourceType: 'Condition', id: 'wrong', subject: { reference: 'Patient/wrong' } }] as Condition[]))
      return json(bundle([]))
    })
    vi.stubGlobal('fetch', fetch)
    const result = await loadStatementCreateData(base, base, patient)
    expect(result.requests.map((choice) => choice.resource.id).sort()).toEqual(['r', 'ref-0', 'ref-1'])
    expect(result.options.map((option) => option.reference)).toContain('Condition/good')
    expect(result.options.map((option) => option.reference)).not.toContain('Condition/wrong')
    expect(result.options.map((option) => option.reference)).not.toContain('Practitioner/pr')
    expect(result.options.map((option) => option.reference)).toContain('PractitionerRole/role')
    expect(fetch.mock.calls.some(([url]) => url.startsWith('https://external.test'))).toBe(false)
    expect(fetch.mock.calls.filter(([url]) => /\/(MedicationRequest|Encounter|RelatedPerson|Condition|Observation|DiagnosticReport)\?/.test(url)).every(([url]) => url.includes('patient=p'))).toBe(true)
  })
  it('creates no resources during matching, offers a pending Patient source, and does not load another patient’s records', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => json(bundle([])))
    vi.stubGlobal('fetch', fetch)
    const result = await loadStatementCreateData('https://source.test/fhir', base, { ...patient, identifier: [{ system: 'urn:mrn', value: '123' }] })
    expect(result.patient).toBeNull()
    expect(result.options.map((option) => option.reference)).toContain('Patient/pending')
    expect(fetch.mock.calls.every((call) => call.length < 2 || (call[1] as RequestInit)?.method !== 'POST')).toBe(true)
    expect(fetch.mock.calls.some((call) => String(call[0]).includes('/MedicationRequest?'))).toBe(false)
  })
  it('keeps optional unavailable choices separate from failed Patient matching', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/Observation?') ? json({}, 403) : json(bundle([]))))
    expect((await loadStatementCreateData(base, base, patient)).warning).toContain('Observation choices are unavailable')
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 403)))
    await expect(loadStatementCreateData('https://source.test', base, { ...patient, identifier: [{ system: 'urn:mrn', value: '123' }] })).rejects.toThrow()
  })
})
