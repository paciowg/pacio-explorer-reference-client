/** Checks separate SMP sections, inline medication List disclosures, stable date ordering, and partial-data handling. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocumentReference, List } from 'fhir/r4'
import { SmpDocumentsContent } from './SmpDocumentsSection'

const list: List = { resourceType: 'List', id: 'list-1', title: 'Discharge medications', status: 'current', mode: 'snapshot', date: '2026-10-23', entry: [{ item: { reference: 'MedicationStatement/s' } }] }
const index: DocumentReference = { resourceType: 'DocumentReference', id: 'collection-1', status: 'current', description: 'Discharge collection', date: '2026-10-24', content: [] }
const baseUrl = 'https://source.test/fhir'
const data = { lists: [list], indexes: [index], listError: '', indexError: '' }

describe('SMP Documents sections', () => {
  it('uses update timestamps to break clinical-date ties before limiting both sections', () => {
    const records = Array.from({ length: 11 }, (_, i) => ({
      id: String(i), meta: { lastUpdated: `2026-10-24T${String(i).padStart(2, '0')}:00:00Z` },
    }))
    const html = renderToStaticMarkup(<SmpDocumentsContent baseUrl={baseUrl} patientId="p" data={{ ...data,
      lists: records.map((record) => ({ ...list, ...record, title: `List entry ${record.id}!` })),
      indexes: records.map((record) => ({ ...index, ...record, description: `Collection entry ${record.id}!` })),
    }} />)
    for (const prefix of ['List', 'Collection']) {
      expect(html.indexOf(`${prefix} entry 10!`)).toBeLessThan(html.indexOf(`${prefix} entry 9!`))
      expect(html).not.toContain(`${prefix} entry 0!`)
    }
  })

  it('uses a collapsed clinical disclosure for Lists instead of a link to their standalone page', () => {
    const html = renderToStaticMarkup(<SmpDocumentsContent baseUrl={baseUrl} patientId="p" data={data} />)
    expect(html.match(/<section class="summary-card clinical-summary-card">/g)).toHaveLength(2)
    const lists = html.slice(0, html.indexOf('<h3>SMP Collections</h3>'))
    expect(lists).toContain('<li class="clinical-list-item clinical-list-expandable-item"><details class="clinical-entry-disclosure"><summary>')
    expect(lists).toContain('Discharge medications')
    expect(lists).toContain('1 medication')
    expect(lists).toContain('2026-10-23')
    expect(lists).toContain('clinical-entry-chevron')
    expect(lists).not.toContain('<details open')
    expect(lists).not.toContain('/medication-lists/list-1')
    expect(lists.indexOf('View FHIR JSON')).toBeGreaterThan(lists.indexOf('</summary>'))
    expect(html).toContain('clinical-select-button')
    expect(html).toContain('Discharge collection')
  })
  it('sorts before limiting each section and preserves the source order for equal dates', () => {
    const lists = Array.from({ length: 11 }, (_, i) => ({ ...list, id: `old-${i}`, title: `Entry ${i}`, date: '2026-10-01' }))
    const latest = { ...list, id: 'latest', title: 'Newest entry', date: '2026-10-26' }
    const source = [...lists, latest]
    const html = renderToStaticMarkup(<SmpDocumentsContent baseUrl={baseUrl} patientId="p" data={{ ...data, lists: source }} />)
    expect(html.indexOf('Newest entry')).toBeLessThan(html.indexOf('Entry 0'))
    expect(html.indexOf('Entry 0')).toBeLessThan(html.indexOf('Entry 1'))
    expect(html).not.toContain('Entry 9')
    expect(source[0]).toBe(lists[0])
    expect(source.at(-1)).toBe(latest)
  })
  it('retains a readable List section when collection search fails and distinguishes empty and loading states', () => {
    const partial = renderToStaticMarkup(<SmpDocumentsContent baseUrl={baseUrl} patientId="p" data={{ ...data, indexes: null, indexError: 'Search failed' }} />)
    expect(partial).toContain('Discharge medications')
    expect(partial).toContain('Collections unavailable: Search failed')
    const empty = renderToStaticMarkup(<SmpDocumentsContent baseUrl={baseUrl} patientId="p" data={{ ...data, lists: [], indexes: [] }} />)
    expect(empty.match(/None recorded/g)).toHaveLength(2)
    const loading = renderToStaticMarkup(<SmpDocumentsContent baseUrl={baseUrl} patientId="p" data={null} />)
    expect(loading).toContain('Loading medication Lists')
    expect(loading).toContain('Loading SMP collections')
  })
})
