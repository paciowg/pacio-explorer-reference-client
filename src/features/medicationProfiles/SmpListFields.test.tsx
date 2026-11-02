/** Checks shared List controls expose existing non-default values and preserve dates and notes without coercion. */
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement, ReactNode } from 'react'
import type { List } from 'fhir/r4'
import { describe, expect, it, vi } from 'vitest'
import { SmpListEmptyReason, SmpListFields } from './SmpListFields'
import { EXISTING_LIST_VALUE, initialSmpListEdit } from './smpListEditModel'

const original: List = { resourceType: 'List', status: 'retired', mode: 'changes', code: { text: 'Unusual list type' }, date: '2026-10', source: { reference: 'Practitioner/unavailable', display: 'Alex Example' },
  emptyReason: { text: 'Unusual empty reason' }, note: [{ text: 'Keep existing note', authorString: 'Alex', time: '2026-10-23' }, { text: 'Second note' }] }
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  const element = node as ReactElement<Record<string, unknown>>
  return [element, ...nodes(element.props?.children as ReactNode)]
}
describe('shared List fields', () => {
  it('offers only the creation defaults for a new List', () => {
    const html = renderToStaticMarkup(<SmpListFields authors={[]} value={{ typeCode: '', date: '2026-11-02', author: '', notes: '' }} onChange={() => {}} />)
    expect(html).toContain('Active medication list')
    expect(html).not.toContain('Private medication list')
    expect(html).not.toContain('Existing:')
    expect(html).toContain('Mode: snapshot · Status: current')
    expect(html).toContain('>Notes</label>')
  })
  it('keeps original dropdown options available after selecting another value and shows actual mode/status', () => {
    const html = renderToStaticMarkup(<SmpListFields authors={[]} original={original} value={{ ...initialSmpListEdit(original), typeCode: '104202-7', author: '' }} onChange={() => {}} />)
    expect(html).toContain('Existing: Unusual list type')
    expect(html).toContain('Existing: Practitioner: Alex Example')
    expect(html).toContain('Mode: changes · Status: retired')
    const empty = renderToStaticMarkup(<SmpListEmptyReason original={original} value="closed" onChange={() => {}} />)
    expect(empty).toContain(`value="${EXISTING_LIST_VALUE}"`)
    expect(empty).toContain('Existing: Unusual empty reason')
  })
  it('shows existing notes read-only and only binds the new-note textarea', () => {
    const html = renderToStaticMarkup(<SmpListFields authors={[]} original={original} value={initialSmpListEdit(original)} onChange={() => {}} />)
    expect(html).toContain('Keep existing note')
    expect(html).toContain('Second note')
    expect(html).toContain('Alex')
    expect(html).toContain('>New note</label>')
    expect(html).toContain('<textarea id="smp-notes"></textarea>')
    expect(html.match(/<textarea/g)).toHaveLength(1)
  })
  it.each(['2026', '2026-10', '2026-10-23T12:34:56-04:00'])('allows an optional date-only replacement without coercing %s', (date) => {
    const onChange = vi.fn()
    const list = { ...original, date }
    const tree = SmpListFields({ authors: [], original: list, value: initialSmpListEdit(list), onChange })
    const input = nodes(tree).find((node) => node.props.id === 'smp-date')!
    expect(input.props.value).toBe('')
    expect(input.props.required).toBe(false)
    ;(input.props.onChange as (event: unknown) => void)({ target: { value: '2026-11-02' } })
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-11-02' })
    ;(input.props.onChange as (event: unknown) => void)({ target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({ date })
  })
})
