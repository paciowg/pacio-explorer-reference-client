/** Verifies transfer-list title filtering, membership, accessible controls, and removable unavailable selections. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TransferList } from './TransferList'
import { compareTransferListDates, filterTransferListOptions, transferListSelection } from './transferListModel'
import { formatDate } from '../lib/fhir/formatters'

const options = [
  { value: 'Coverage/a', label: 'Coverage: Health plan' },
  { value: 'ClaimResponse/b', label: 'ClaimResponse: Approval' },
]

describe('transfer list', () => {
  it('matches title substrings without case sensitivity and ignores surrounding search whitespace', () => {
    expect(filterTransferListOptions(options, '  HEALTH pL  ')).toEqual([options[0]])
    expect(filterTransferListOptions(options, 'Coverage/a')).toEqual([])
    expect(filterTransferListOptions(options, 'missing')).toEqual([])
    expect(filterTransferListOptions(options, '   ')).toEqual(options)
    expect(filterTransferListOptions(options, '')).toEqual(options)
  })

  it('filters without changing ordering, dates, membership, or the other pane', () => {
    const items = [
      { value: 'new', label: 'Assessment: Mobility', dateValue: '2026-10-13' },
      { value: 'old', label: 'Assessment: Mobility', dateValue: '2026-10-12' },
      { value: 'other', label: 'Assessment: Cognition' },
    ]
    const values = ['old', 'other']
    const available = items.filter((item) => !values.includes(item.value))
    const selected = items.filter((item) => values.includes(item.value))
    expect(filterTransferListOptions(available, 'mobility')).toEqual([items[0]])
    expect(filterTransferListOptions(selected, 'cognition')).toEqual([items[2]])
    expect(filterTransferListOptions(items, 'mobility')).toEqual([items[0], items[1]])
    expect(filterTransferListOptions(selected, '')).toEqual([items[1], items[2]])
    expect(values).toEqual(['old', 'other'])
    expect(items.map((item) => item.value)).toEqual(['new', 'old', 'other'])
  })

  it('provides distinct labelled search fields outside each scrolling list', () => {
    const html = renderToStaticMarkup(<TransferList label="Insurance" options={options} values={['Coverage/a']} onChange={() => {}} />)
    expect(html.match(/type="search"/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Search available in Insurance"')
    expect(html).toContain('aria-label="Search selected in Insurance"')
    for (const section of html.split('<section').slice(1)) {
      expect(section.indexOf('type="search"')).toBeLessThan(section.indexOf('<ul'))
      const inputId = section.match(/<input id="([^"]+)"/)?.[1]
      expect(inputId).toBeDefined()
      expect(section).toContain(`<label for="${inputId}">`)
    }
  })

  it('sorts both resource panes by full timestamp and exposes dates for identical names', () => {
    const dated = [
      { value: 'Observation/old', label: 'Assessment', dateValue: '2026-10-13T08:00:00Z', dateLabel: 'Effective' },
      { value: 'Observation/new', label: 'Assessment', dateValue: '2026-10-13T09:00:00-04:00', dateLabel: 'Effective' },
      { value: 'Observation/undated', label: 'Undated assessment' },
    ]
    const render = (values: string[]) => renderToStaticMarkup(<TransferList label="Assessments" options={dated} values={values} showDates onChange={() => {}} />)
    for (const values of [[], ['Observation/old', 'Observation/new', 'Observation/undated']]) {
      const html = render(values)
      expect(html.indexOf('<time dateTime="2026-10-13T09:00:00-04:00"')).toBeLessThan(html.indexOf('<time dateTime="2026-10-13T08:00:00Z"'))
      expect(html).toContain(`Effective: ${formatDate('2026-10-13T09:00:00-04:00')}`)
      expect(html.indexOf('Undated assessment')).toBeGreaterThan(html.indexOf('<time dateTime="2026-10-13T08:00:00Z"'))
      expect(html).toContain('Date unavailable')
    }
    expect(dated.map((option) => option.value)).toEqual(['Observation/old', 'Observation/new', 'Observation/undated'])
  })

  it('retains input order for tied dates and puts missing or invalid dates last', () => {
    const items = [
      { value: 'missing' }, { value: 'first', dateValue: '2026-10-13' },
      { value: 'invalid', dateValue: 'invalid' }, { value: 'second', dateValue: '2026-10-13' },
    ]
    expect([...items].sort(compareTransferListDates).map((item) => item.value)).toEqual(['first', 'second', 'missing', 'invalid'])
  })
  it('adds without duplicates and removes only the requested value, preserving other references', () => {
    const initial = ['Coverage/a', 'Coverage/unavailable']
    const added = transferListSelection(initial, 'ClaimResponse/b', true)
    expect(added).toEqual(['Coverage/a', 'Coverage/unavailable', 'ClaimResponse/b'])
    expect(transferListSelection(added, 'ClaimResponse/b', true)).toEqual(added)
    expect(transferListSelection(added, 'Coverage/unavailable', false)).toEqual(['Coverage/a', 'ClaimResponse/b'])
    expect(initial).toEqual(['Coverage/a', 'Coverage/unavailable'])
  })

  it('shows each option in exactly one pane with labelled native transfer buttons', () => {
    const html = renderToStaticMarkup(<TransferList label="Insurance" options={options} values={['Coverage/a']} onChange={() => {}} />)
    const available = html.slice(0, html.indexOf('Selected (1)'))
    const selected = html.slice(html.indexOf('Selected (1)'))
    expect(available).toContain('Available (1)')
    expect(available).toContain('aria-label="Add ClaimResponse: Approval to Insurance"')
    expect(available).not.toContain('Coverage: Health plan')
    expect(selected).toContain('aria-label="Remove Coverage: Health plan from Insurance"')
    expect(selected).not.toContain('ClaimResponse: Approval')
    expect(html.match(/type="button"/g)).toHaveLength(2)
    expect(html).toContain('role="status">1 selected')
  })

  it('moves items between panes when the controlled selection changes', () => {
    const values = transferListSelection([], 'Coverage/a', true)
    const added = renderToStaticMarkup(<TransferList label="Insurance" options={options} values={values} onChange={() => {}} />)
    expect(added).toContain('aria-label="Remove Coverage: Health plan from Insurance"')
    const removed = renderToStaticMarkup(<TransferList label="Insurance" options={options} values={transferListSelection(values, 'Coverage/a', false)} onChange={() => {}} />)
    expect(removed).toContain('aria-label="Add Coverage: Health plan to Insurance"')
    expect(removed).toContain('None selected')
  })

  it('shows empty states and preserves unavailable selections as removable items', () => {
    const html = renderToStaticMarkup(<TransferList label="Goals" options={[]} values={['Goal/missing']} onChange={() => {}} />)
    expect(html).toContain('No available options')
    expect(html).toContain('aria-label="Remove Goal/missing (Unavailable) from Goals"')
    expect(transferListSelection(['Goal/missing'], 'Goal/missing', false)).toEqual([])
  })

  it('disables every transfer action along with the fieldset', () => {
    const html = renderToStaticMarkup(<TransferList label="Insurance" options={options} values={['Coverage/a']} disabled onChange={() => {}} />)
    expect(html).toContain('<fieldset class="toc-section-card transfer-list" disabled="">')
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2)
    expect(html.match(/<input[^>]*disabled=""/g)).toHaveLength(2)
  })
})
