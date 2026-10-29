/** Checks fresh full reads, patient boundaries, and optional read-only label resolution for imported statements. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { externalMedicationStatement } from '../../test/fixtures/externalMedicationStatement'
import { loadStatementEditData } from './statementEditData'

const base = 'https://source.test/fhir'
const patient = { resourceType: 'Patient', id: 'p', name: [{ text: 'Pat Example' }] }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/fhir+json' } })
afterEach(() => vi.unstubAllGlobals())

describe('statement editing data', () => {
  it('reads the full original and renders context without copying a request’s current medication or dosage', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/Patient/p')) return json(patient)
      if (url.endsWith('/MedicationStatement/external-statement')) return json(externalMedicationStatement)
      if (url.endsWith('/MedicationRequest/second')) return json({ resourceType: 'MedicationRequest', id: 'second', medicationCodeableConcept: { text: 'Changed prescription' }, dosageInstruction: [{ text: 'Changed dosage' }] })
      return json({}, 404)
    })
    vi.stubGlobal('fetch', fetch)
    const result = await loadStatementEditData(base, 'p', 'external-statement')
    expect(result.original).toEqual(externalMedicationStatement)
    const fields = result.details?.groups.flatMap((group) => group.fields)
    expect(fields?.find((field) => field.label === 'Medication')?.values).toEqual(['Externally compounded medication'])
    expect(fields?.find((field) => field.label === 'Context')?.values).toEqual(['Original episode'])
    expect(fields?.find((field) => field.label === 'Date asserted')?.values).toEqual(['2021-03'])
    expect(fields?.find((field) => field.label === 'Notes')?.values[0]).toContain('Original author')
    expect(fields?.some((field) => ['Status', 'Adherence', 'Adherence reason'].includes(field.label))).toBe(false)
    expect(fetch.mock.calls.some(([url]) => url.includes('?') || url.includes('/metadata'))).toBe(false)
  })
  it.each([
    { ...externalMedicationStatement, subject: { reference: 'Patient/other' } },
    { ...externalMedicationStatement, subject: { reference: 'https://other.test/fhir/Patient/p' } },
    { ...externalMedicationStatement, id: 'wrong-id' },
  ])('rejects a wrong patient or statement identity', async (statement) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/Patient/p') ? json(patient) : json(statement)))
    await expect(loadStatementEditData(base, 'p', 'external-statement')).rejects.toThrow()
  })
  it('propagates a failed full statement read rather than using summary data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/Patient/p') ? json(patient) : json({}, 404)))
    await expect(loadStatementEditData(base, 'p', 'missing')).rejects.toThrow('404')
  })
})
