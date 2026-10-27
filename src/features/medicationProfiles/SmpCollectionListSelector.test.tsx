/** Verifies collection selection markup, stable dated ordering, and independent checkbox actions. */
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import type { List } from 'fhir/r4'
import { describe, expect, it, vi } from 'vitest'
import { SmpCollectionListSelector } from './SmpCollectionListSelector'
import { SmpMedicationListItem } from './SmpMedicationListItem'
import type { ResourceReferenceOption } from '../../lib/fhir/resourceOptions'

const option = (id: string, date?: string, updated?: string): ResourceReferenceOption => ({
  reference: `List/${id}`, label: id, display: id,
  resource: { resourceType: 'List', id, title: id, status: 'current', mode: 'snapshot', date, meta: { lastUpdated: updated } } as List,
})
const defaults = { baseUrl: 'https://example.test/fhir', patientId: 'p', disabled: false }

describe('collection list selection', () => {
  it('shows full-width disclosure rows with separate checkboxes, counts, and labelled update fallback', () => {
    const html = renderToStaticMarkup(<SmpCollectionListSelector {...defaults} options={[option('Discharge', undefined, '2026-10-25T14:00:00Z')]} values={['List/Discharge']} onChange={() => {}} />)
    expect(html).toContain('1 selected')
    expect(html).toContain('aria-label="Include Discharge"')
    expect(html).toContain('checked=""')
    expect(html).toContain('smp-selectable-list')
    expect(html).toContain('Last updated')
    expect(html).toContain('0 medications')
    expect(html.indexOf('type="checkbox"')).toBeLessThan(html.indexOf('<details'))
    expect(html.indexOf('</label>')).toBeLessThan(html.indexOf('<details'))
    expect(html).not.toContain('transfer-list')
    expect(html).not.toContain('Loading medication List details')
  })
  it('keeps newest first, breaks clinical-date ties by update time, and preserves equal/undated order', () => {
    const html = renderToStaticMarkup(<SmpCollectionListSelector {...defaults} values={[]} onChange={() => {}} options={[
      option('undated-a'), option('older', '2026-10-24', '2026-10-25T13:00:00Z'), option('newer', '2026-10-24', '2026-10-25T14:00:00Z'),
      option('undated-b'), option('newest', '2026-10-26'), option('equal', '2026-10-24', '2026-10-25T14:00:00Z'),
    ]} />)
    const positions = ['newest', 'newer', 'equal', 'older', 'undated-a', 'undated-b'].map((id) => html.indexOf(`Include ${id}`))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(html).toContain('Date unavailable')
  })
  it('updates controlled selection without moving rows or coupling selection to expansion', () => {
    const onChange = vi.fn()
    const element = SmpCollectionListSelector({ ...defaults, options: [option('one'), option('two')], values: ['List/one'], onChange })
    const ul = (element.props.children as ReactElement<{ children: ReactElement<Parameters<typeof SmpMedicationListItem>[0]>[] }>[]).find((child) => child?.type === 'ul')!
    const rows = ul.props.children as ReactElement<Parameters<typeof SmpMedicationListItem>[0]>[]
    rows[0].props.selection!.onChange(false)
    expect(onChange).toHaveBeenLastCalledWith([])
    rows[1].props.selection!.onChange(true)
    expect(onChange).toHaveBeenLastCalledWith(['List/one', 'List/two'])
    const disabled = renderToStaticMarkup(<SmpCollectionListSelector {...defaults} disabled options={[option('one')]} values={[]} onChange={onChange} />)
    expect(disabled).toContain('disabled=""')
  })
  it('shows a useful empty state', () => {
    const html = renderToStaticMarkup(<SmpCollectionListSelector {...defaults} options={[]} values={[]} onChange={() => {}} />)
    expect(html).toContain('No medication Lists are available for this patient.')
    expect(html).toContain('0 selected')
  })
})
