/** Verifies readable multi-List snapshots, patient boundaries, captured resolution, and accessible SMP actions. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Bundle, List, MedicationStatement, Patient } from 'fhir/r4'
import { SmpListContent } from './SmpListContent'
import { SmpDocumentsSection } from './SmpDocumentsSection'
import { snapshotResolver, unresolvedSnapshotReferences, validateSnapshotPatient } from './smpViewing'
import { getResourceTransferChoices } from '../../lib/fhir/resourceOptions'
import { TransferList } from '../../components/TransferList'

const patient: Patient = { resourceType: 'Patient', id: 'source', name: [{ family: 'Example', given: ['Pat'] }], birthDate: '1970-01-01' }
const list: List = { resourceType: 'List', id: 'l', title: 'Discharge medications', status: 'current', mode: 'snapshot', date: '2026-10-23', subject: { reference: 'urn:uuid:p' }, source: { reference: 'urn:uuid:role', display: 'Alex Example — Physician' }, entry: [{ item: { reference: 'urn:uuid:s' } }] }
const statement: MedicationStatement = { resourceType: 'MedicationStatement', id: 's', status: 'active', subject: { reference: 'urn:uuid:p' }, medicationCodeableConcept: { text: 'Captured aspirin' }, dosage: [{ text: 'One tablet daily' }] }
const bundle: Bundle = { resourceType: 'Bundle', type: 'collection', entry: [{ fullUrl: 'urn:uuid:l', resource: list }, { fullUrl: 'urn:uuid:p', resource: patient }, { fullUrl: 'urn:uuid:s', resource: statement }] }

describe('SMP snapshot viewing', () => {
  it('can omit redundant List JSON while preserving captured medication JSON on collection detail pages', () => {
    const html = renderToStaticMarkup(<SmpListContent list={list} resolve={snapshotResolver(bundle)} showListJson={false} />)
    expect(html).not.toContain('List FHIR JSON')
    expect(html).toContain('Captured FHIR JSON')
    expect(html).toContain('Captured aspirin')
  })
  it('renders stored membership and dosage without live-resource links', () => {
    const html = renderToStaticMarkup(<SmpListContent list={list} resolve={snapshotResolver(bundle)} />)
    expect(html).toContain('Discharge medications')
    expect(html).toContain('Captured aspirin')
    expect(html).toContain('One tablet daily')
    expect(html).toContain('Alex Example')
    expect(html).not.toContain('#/fhir/')
    expect(html).toContain('Captured FHIR JSON')
    expect(() => validateSnapshotPatient(bundle, { ...patient, id: 'destination' })).not.toThrow()
    expect(unresolvedSnapshotReferences(bundle)).toEqual(['urn:uuid:role'])
  })
  it('uses only source links for live Lists, with each medication link inside its disclosure and the List link at the bottom', () => {
    const html = renderToStaticMarkup(<SmpListContent list={list} resolve={snapshotResolver(bundle)} baseUrl="https://source.test/fhir" embedded />)
    expect(html).not.toContain('Captured FHIR JSON')
    expect(html).not.toContain('List FHIR JSON')
    expect(html).not.toContain('<pre')
    expect(html.match(/class="fhir-json-link"/g)).toHaveLength(2)
    const medicationLink = html.indexOf('href="#/fhir/MedicationStatement/s"')
    const medicationClose = html.indexOf('</details>')
    expect(medicationLink).toBeGreaterThan(html.indexOf('</summary>'))
    expect(medicationLink).toBeLessThan(medicationClose)
    expect(html.indexOf('href="#/fhir/List/l"')).toBeGreaterThan(medicationClose)
  })
  it('links a contained medication to its owning List instead of an unrelated standalone resource', () => {
    const contained: List = { ...list, contained: [{ ...statement, id: 'contained-statement' }], entry: [{ item: { reference: '#contained-statement' } }] }
    const captured: Bundle = { ...bundle, entry: [{ fullUrl: 'urn:uuid:l', resource: contained }, ...bundle.entry!.slice(1)] }
    const html = renderToStaticMarkup(<SmpListContent list={contained} resolve={snapshotResolver(captured)} baseUrl="https://source.test/fhir" embedded />)
    expect(html).toContain('Captured aspirin')
    expect(html).not.toContain('/fhir/MedicationStatement/contained-statement')
    expect(html).not.toContain('Captured FHIR JSON')
    expect(html.match(/class="fhir-json-link"/g)).toHaveLength(2)
  })
  it('shows explicit empty reasons and missing statements', () => {
    expect(renderToStaticMarkup(<SmpListContent list={{ ...list, entry: [], emptyReason: { text: 'Information unavailable' } }} resolve={snapshotResolver(bundle)} />)).toContain('<dt>Empty reason</dt><dd>Information unavailable</dd>')
    const html = renderToStaticMarkup(<SmpListContent list={{ ...list, entry: [{ item: { reference: 'urn:uuid:missing' } }] }} resolve={snapshotResolver(bundle)} />)
    expect(html).toContain('Statement unavailable: urn:uuid:missing')
  })
  it('rejects document Bundles, multiple patients, and a mismatched patient before rendering', () => {
    expect(() => validateSnapshotPatient({ ...bundle, type: 'document' })).toThrow('supported SMP')
    expect(() => validateSnapshotPatient({ ...bundle, entry: [...bundle.entry!, { resource: { ...patient, id: 'other' } }] })).toThrow('exactly one')
    const wrong = { ...list, subject: { reference: 'Patient/wrong' } }
    expect(() => validateSnapshotPatient({ ...bundle, entry: [{ fullUrl: 'urn:uuid:l', resource: wrong }, ...bundle.entry!.slice(1)] })).toThrow('mismatched')
    expect(() => validateSnapshotPatient(bundle, { ...patient, name: [{ family: 'Other', given: ['Person'] }] })).toThrow('demographics')
  })
  it('resolves an embedded absolute fullUrl without allowing an external read', () => {
    const absolute = 'https://source.test/fhir/Patient/source'
    const snapshot: Bundle = { ...bundle, entry: [{ resource: { ...list, subject: { reference: absolute } } as List }, { fullUrl: absolute, resource: patient }] }
    expect(() => validateSnapshotPatient(snapshot)).not.toThrow()
    expect(snapshotResolver(snapshot)('https://outside.test/Patient/source')).toBeUndefined()
  })
  it('provides both creation actions and uses dated accessible transfer controls for statements', () => {
    const section = renderToStaticMarkup(<SmpDocumentsSection baseUrl="https://source.test/fhir" patientId="patient 1" />)
    expect(section).toContain('<button type="button" class="secondary-button outline compact">Create medication list</button>')
    expect(section).toContain('<button type="button" class="secondary-button outline compact">Create SMP collection</button>')
    const resource: MedicationStatement = { ...statement, dateAsserted: '2026-10-23' }
    const options = getResourceTransferChoices([{ reference: 'MedicationStatement/s', label: 'MedicationStatement: Aspirin', display: 'Aspirin', resource }], ['MedicationStatement'])
    const html = renderToStaticMarkup(<TransferList label="Medication statements" options={options} values={[]} showDates onChange={() => {}} />)
    expect(html).toContain('Add Aspirin (Asserted: 2026-10-23) to Medication statements')
    expect(html).not.toContain('<select multiple')
  })
})
