/** Exercises shared Patient matching, guarded writes, reference freshness, and retry behavior through the real transport. */
import type { Condition, Medication, MedicationRequest, Patient } from 'fhir/r4'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalogMedication } from '../../igs/pacioSmp/medicationStatement'
import { createPatientMedicationStatement, type CreateStatementInput, type StatementCreationProgress } from './createMedicationStatement'

const base = 'https://source.test/fhir'
const destination = 'https://destination.test/fhir'
const patient: Patient = { resourceType: 'Patient', id: 'p', identifier: [{ system: 'urn:mrn', value: '123' }], meta: { versionId: '1' } }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/fhir+json' } })
function input(alternate = false): CreateStatementInput {
  return { sourceBaseUrl: base, destinationBaseUrl: alternate ? destination : base, patient,
    data: { patient: alternate ? null : patient, options: [], requests: [], warning: '' },
    statement: { status: 'active', medicationCodeableConcept: catalogMedication('313782') } }
}
afterEach(() => vi.unstubAllGlobals())

describe('statement publication', () => {
  it('writes only a statement on the source server and retains an already saved result', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => json({ ...JSON.parse(init?.body as string), id: 'saved' }))
    vi.stubGlobal('fetch', fetch)
    const progress: StatementCreationProgress = {}
    const saved = await createPatientMedicationStatement(input(), progress)
    expect(saved.subject.reference).toBe('Patient/p')
    expect(fetch.mock.calls[0][0]).toBe(`${base}/MedicationStatement`)
    expect(await createPatientMedicationStatement(input(), progress)).toBe(saved)
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('copies a missing Patient, remaps the information source, and retains that Patient after a definite statement rejection', async () => {
    let attempts = 0
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/Patient?')) return json({ resourceType: 'Bundle', type: 'searchset', entry: [] })
      const body = JSON.parse(init?.body as string)
      if (url.endsWith('/Patient')) {
        expect(body.id).toBeUndefined()
        expect(body.meta).toBeUndefined()
        return json({ ...body, id: 'dest-p' })
      }
      if (++attempts === 1) return json({ issue: [{ diagnostics: 'Rejected statement' }] }, 422)
      return json({ ...body, id: 'statement' })
    })
    vi.stubGlobal('fetch', fetch)
    const values = input(true)
    values.statement.informationSource = { reference: 'Patient/pending' }
    const progress: StatementCreationProgress = {}
    await expect(createPatientMedicationStatement(values, progress)).rejects.toThrow('Rejected statement')
    expect(progress.patient?.id).toBe('dest-p')
    const saved = await createPatientMedicationStatement(values, progress)
    expect(saved.subject.reference).toBe('Patient/dest-p')
    expect(saved.informationSource?.reference).toBe('Patient/dest-p')
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/Patient'))).toHaveLength(1)
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/MedicationStatement'))).toHaveLength(2)
    expect(fetch.mock.calls.filter(([url]) => url.includes('/Patient?'))).toHaveLength(1)
  })
  it('reuses an alternate-server Patient match and keeps all request/medication references destination-local', async () => {
    const values = input(true)
    const matched: Patient = { ...patient, id: 'destination-p' }
    const medication: Medication = { resourceType: 'Medication', id: 'm', code: catalogMedication('313782') }
    const request: MedicationRequest = { resourceType: 'MedicationRequest', id: 'r', status: 'active', intent: 'order', subject: { reference: 'Patient/destination-p' }, medicationReference: { reference: 'Medication/m' }, dosageInstruction: [{ text: 'Copied instructions' }] }
    values.data.patient = matched
    values.data.options = [medication, request].map((resource) => ({ resource, reference: `${resource.resourceType}/${resource.id}`, display: resource.id!, label: resource.id! }))
    values.statement = { status: 'not-taken', medicationReference: { reference: 'Medication/m' }, basedOn: [{ reference: 'MedicationRequest/r' }], dosage: request.dosageInstruction, adherence: 'not-taking' }
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/Patient?')) return json({ resourceType: 'Bundle', type: 'searchset', entry: [{ resource: matched }] })
      if (url.endsWith('/MedicationRequest/r')) return json(request)
      if (url.endsWith('/Medication/m')) return json(medication)
      return json({ ...JSON.parse(init?.body as string), id: 'statement' })
    })
    vi.stubGlobal('fetch', fetch)
    const saved = await createPatientMedicationStatement(values, {})
    expect(saved.subject.reference).toBe('Patient/destination-p')
    expect(saved.medicationReference?.reference).toBe('Medication/m')
    expect(saved.basedOn?.[0].reference).toBe('MedicationRequest/r')
    expect(saved.dosage).toEqual(request.dosageInstruction)
    expect(fetch.mock.calls.every(([url]) => url.startsWith(destination))).toBe(true)
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })
  it.each(['Patient', 'MedicationStatement'])('blocks retries after an uncertain %s write', async (stage) => {
    const values = input(stage === 'Patient')
    const fetch = vi.fn(async (url: string) => url.includes('/Patient?') ? json({ resourceType: 'Bundle', type: 'searchset', entry: [] }) : json({}, 503))
    vi.stubGlobal('fetch', fetch)
    const progress: StatementCreationProgress = {}
    await expect(createPatientMedicationStatement(values, progress)).rejects.toThrow('Verify the destination')
    expect(progress.uncertain).toBe(stage)
    const count = fetch.mock.calls.length
    await expect(createPatientMedicationStatement(values, progress)).rejects.toThrow('uncertain')
    expect(fetch.mock.calls).toHaveLength(count)
  })
  it('rejects invalid input and changed references before any writes', async () => {
    const fetch = vi.fn(async () => json({ resourceType: 'Condition', id: 'c', subject: { reference: 'Patient/p' }, meta: { versionId: '2' } }))
    vi.stubGlobal('fetch', fetch)
    await expect(createPatientMedicationStatement({ ...input(), statement: { status: 'active' } }, {})).rejects.toThrow('medication')
    expect(fetch).not.toHaveBeenCalled()
    const values = input()
    values.statement.reasonReference = [{ reference: 'Condition/c' }]
    values.data.options = [{ reference: 'Condition/c', display: 'Reason', label: 'Condition: Reason', resource: { resourceType: 'Condition', id: 'c', subject: { reference: 'Patient/p' }, meta: { versionId: '1' } } as Condition }]
    await expect(createPatientMedicationStatement(values, {})).rejects.toThrow('changed')
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('stops on failed matching and wrong-patient references', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 403)))
    await expect(createPatientMedicationStatement(input(true), {})).rejects.toThrow('403')
    const values = input()
    values.statement.reasonReference = [{ reference: 'Condition/c' }]
    values.data.options = [{ reference: 'Condition/c', display: 'Wrong patient', label: 'Condition: Wrong patient', resource: { resourceType: 'Condition', id: 'c', subject: { reference: 'Patient/other' } } as Condition }]
    await expect(createPatientMedicationStatement(values, {})).rejects.toThrow('destination patient')
  })
})
