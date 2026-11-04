/** Exercises live List editor submission, navigation, and failure recovery without a browser or external writes. */
import { PatientFormHeader } from '../../components/PatientFormHeader'
import type { ReactElement, ReactNode } from 'react'
import type { List } from 'fhir/r4'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ cursor: 0, cells: [] as unknown[], effects: [] as (() => void)[],
  load: vi.fn(), save: vi.fn(), navigate: vi.fn(), notify: vi.fn(), server: { baseUrl: 'https://source.test/fhir', label: 'Source' },
}))
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++
    if (!(index in harness.cells)) harness.cells[index] = typeof initial === 'function' ? initial() : initial
    return [harness.cells[index], (next: unknown) => { harness.cells[index] = typeof next === 'function' ? next(harness.cells[index]) : next }]
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++
    if (!(index in harness.cells)) harness.cells[index] = { current: initial }
    return harness.cells[index]
  },
  useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
    const index = harness.cursor++
    const previous = harness.cells[index] as { deps: unknown[]; cleanup?: () => void } | undefined
    if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
      previous?.cleanup?.()
      const cell = { deps, cleanup: undefined as (() => void) | undefined }
      harness.cells[index] = cell
      harness.effects.push(() => { cell.cleanup = effect() || undefined })
    }
  },
}))
vi.mock('../servers/useSavedServers', () => ({ useSavedServers: () => ({ activeServer: harness.server }) }))
vi.mock('./smpListEditData', () => ({ loadSmpListEditData: harness.load }))
vi.mock('../../lib/fhir/resourceTransport', async (original) => ({ ...await original<typeof import('../../lib/fhir/resourceTransport')>(), updateResource: harness.save }))
vi.mock('../../lib/routing/routes', () => ({ navigateTo: harness.navigate, getRouteHref: (path: string) => `#${path}` }))
vi.mock('../../lib/routing/routeNotification', () => ({ setRouteNotification: harness.notify }))

import { SmpListEditPage } from './SmpListEditPage'
import { SmpListFields } from './SmpListFields'
import { TransferList } from '../../components/TransferList'
import { FhirUpdateError } from '../../lib/fhir/resourceTransport'
import type { SmpListEdit } from './smpListEditModel'

const original: List = { resourceType: 'List', id: 'l', subject: { reference: 'Patient/p' }, title: 'Original list', status: 'current', mode: 'snapshot', date: '2026-10-23T12:34:56Z',
  entry: [{ item: { reference: 'MedicationStatement/s' } }], note: [{ text: 'Existing note', authorString: 'Alex' }] }
const data = { original, choices: { patient: { resourceType: 'Patient', id: 'p', name: [{ text: 'Pat Example' }] }, authors: [], options: [] }, memberOptions: [] }
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  const element = node as ReactElement<Record<string, unknown>>
  if (element.type === PatientFormHeader) return nodes(PatientFormHeader(element.props as Parameters<typeof PatientFormHeader>[0]))
  return [element, ...nodes(element.props?.children as ReactNode)]
}
function render() { harness.cursor = 0; return SmpListEditPage({ patientId: 'p', resourceId: 'l' }) }
async function settle() {
  for (let i = 0; i < 2; i++) {
    for (const effect of harness.effects.splice(0)) effect()
    await new Promise((resolve) => setTimeout(resolve, 0))
    render()
  }
  return render()
}
const fields = (tree: ReactNode) => nodes(tree).find((node) => node.type === SmpListFields)!
const button = (tree: ReactNode) => nodes(tree).find((node) => node.type === 'button' && node.props.type === 'submit')!
function change(tree: ReactNode, patch: Partial<SmpListEdit>) {
  ;(fields(tree).props.onChange as (patch: Partial<SmpListEdit>) => void)(patch)
}
function submit(tree: ReactNode) {
  const form = nodes(tree).find((node) => node.type === 'form')!
  ;(form.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault() {} })
}
beforeEach(() => {
  vi.resetAllMocks()
  harness.cursor = 0; harness.cells = []; harness.effects = []
  harness.load.mockResolvedValue(data)
  harness.save.mockResolvedValue(original)
})

describe('List edit page', () => {
  it('populates the shared controls and keeps unchanged submissions disabled without writing', async () => {
    render(); const tree = await settle()
    expect(harness.load).toHaveBeenCalledWith(harness.server.baseUrl, 'p', 'l')
    expect(fields(tree).props.original).toEqual(original)
    expect(fields(tree).props.value).toMatchObject({ date: original.date, selected: ['existing-entry:0'], notes: '' })
    expect(button(tree).props.disabled).toBe(true)
    submit(tree); await settle()
    expect(harness.save).not.toHaveBeenCalled()
  })
  it('submits once to the original identity and returns to Documents with a success message', async () => {
    render(); let tree = await settle()
    change(tree, { notes: 'New observation' })
    tree = render()
    expect(button(tree).props.disabled).toBe(false)
    submit(tree); submit(tree); tree = await settle()
    expect(harness.save).toHaveBeenCalledExactlyOnceWith(harness.server.baseUrl, { ...original, note: [...original.note!, { text: 'New observation', time: expect.any(String) }] })
    expect(harness.navigate).toHaveBeenCalledWith('/patients/p?view=documents')
    expect(harness.notify).toHaveBeenCalledWith(expect.objectContaining({ routeHref: '#/patients/p?view=documents', message: 'Medication List updated successfully on Source.' }))
    expect(button(tree).props.disabled).toBe(true)
    submit(tree); await settle()
    expect(harness.save).toHaveBeenCalledOnce()
  })
  it('keeps edits after a definite rejection and permits a deliberate retry', async () => {
    harness.save.mockRejectedValueOnce(new FhirUpdateError('List rejected', false))
    render(); let tree = await settle()
    change(tree, { notes: 'Keep this note' })
    submit(render()); tree = await settle()
    expect(button(tree).props.disabled).toBe(false)
    expect(fields(tree).props.value).toMatchObject({ notes: 'Keep this note' })
    expect(harness.navigate).not.toHaveBeenCalled()
    submit(tree); await settle()
    expect(harness.save).toHaveBeenCalledTimes(2)
    expect(harness.save.mock.calls[1][1].note).toHaveLength(2)
  })
  it('locks the form and blocks further writes after an uncertain update', async () => {
    harness.save.mockRejectedValueOnce(new FhirUpdateError('Connection lost', true))
    render(); let tree = await settle()
    change(tree, { notes: 'New note' })
    submit(render()); tree = await settle()
    expect(button(tree).props.disabled).toBe(true)
    expect(nodes(tree).find((node) => node.type === 'fieldset')!.props.disabled).toBe(true)
    expect(nodes(tree).find((node) => node.type === TransferList)!.props.disabled).toBe(true)
    submit(tree); await settle()
    expect(harness.save).toHaveBeenCalledOnce()
    expect(harness.navigate).not.toHaveBeenCalled()
  })
  it('retains invalid edits for correction without writing', async () => {
    render(); let tree = await settle()
    const selector = nodes(tree).find((node) => node.type === TransferList)!
    ;(selector.props.onChange as (selected: string[]) => void)([])
    submit(render()); tree = await settle()
    expect(harness.save).not.toHaveBeenCalled()
    expect(nodes(tree).some((node) => node.props.role === 'alert')).toBe(true)
    expect(fields(tree).props.value).toMatchObject({ selected: [] })
    expect(button(tree).props.disabled).toBe(false)
  })
  it('offers retry on load failure and Back returns without saving', async () => {
    harness.load.mockRejectedValueOnce(new Error('Wrong patient'))
    render(); let tree = await settle()
    expect(fields(tree)).toBeUndefined()
    const back = nodes(tree).find((node) => node.type === 'button' && node.props.children === 'Back to patient')!
    ;(back.props.onClick as () => void)()
    expect(harness.navigate).toHaveBeenCalledWith('/patients/p?view=documents')
    const retry = nodes(tree).find((node) => node.type === 'button' && node.props.children === 'Retry loading')!
    ;(retry.props.onClick as () => void)()
    render(); tree = await settle()
    expect(fields(tree)).toBeDefined()
    expect(harness.load).toHaveBeenCalledTimes(2)
    expect(harness.save).not.toHaveBeenCalled()
  })
})
