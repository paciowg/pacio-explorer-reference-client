/** Exercises collection form submission, retry state, and live List previews without a browser or FHIR server. */
import type { ReactElement, ReactNode } from 'react'
import type { List, Patient } from 'fhir/r4'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  cursor: 0, cells: [] as unknown[], pending: [] as (() => void)[],
  load: vi.fn(), prepare: vi.fn(), match: vi.fn(), publish: vi.fn(), navigate: vi.fn(), notify: vi.fn(), save: vi.fn(), details: vi.fn(),
  server: { baseUrl: 'https://source.test/fhir', label: 'Source' },
  destination: { baseUrl: 'https://destination.test/fhir', label: 'Destination' },
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++
    if (!(index in harness.cells)) harness.cells[index] = typeof initial === 'function' ? initial() : initial
    return [harness.cells[index], (next: unknown) => {
      harness.cells[index] = typeof next === 'function' ? next(harness.cells[index]) : next
    }]
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++
    if (!(index in harness.cells)) harness.cells[index] = { current: initial }
    return harness.cells[index]
  },
  useEffect: (effect: () => void, deps: unknown[]) => {
    const index = harness.cursor++
    const previous = harness.cells[index] as unknown[] | undefined
    if (!previous || deps.some((dep, i) => dep !== previous[i])) harness.pending.push(effect)
    harness.cells[index] = deps
  },
}))
vi.mock('../servers/useSavedServers', () => ({ useSavedServers: () => ({ activeServer: harness.server, savedServers: [harness.server, harness.destination] }) }))
vi.mock('./smpData', async (original) => ({ ...await original<typeof import('./smpData')>(), loadSmpChoices: harness.load }))
vi.mock('./smpReferences', async (original) => ({ ...await original<typeof import('./smpReferences')>(), prepareSmpSnapshot: harness.prepare }))
vi.mock('./smpPublishing', () => ({ matchSmpPatient: harness.match, publishSmpCollection: harness.publish }))
vi.mock('./smpListCreation', () => ({ saveSmpMedicationList: harness.save }))
vi.mock('./smpListDetails', () => ({ loadSmpListDetails: harness.details }))
vi.mock('../../lib/routing/routes', () => ({ navigateTo: harness.navigate, getRouteHref: (route: string) => `#${route}` }))
vi.mock('../../lib/routing/routeNotification', () => ({ setRouteNotification: harness.notify }))

import { SmpCreatePage } from './SmpCreatePage'
import { SmpCollectionListSelector } from './SmpCollectionListSelector'
import { SmpMedicationListItem } from './SmpMedicationListItem'
import { DestinationServerField } from '../servers/DestinationServerField'
import { TransferList } from '../../components/TransferList'
import { SmpSourceChangedError } from './smpReferences'
import type { SmpProgress } from './smpPublishing'

const patient: Patient = { resourceType: 'Patient', id: 'p' }
const list: List = { resourceType: 'List', id: 'l', title: 'Discharge', status: 'current', mode: 'snapshot' }
const snapshot = { patient, bundle: { resourceType: 'Bundle', type: 'collection', entry: [] }, originals: new Map() }
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  const element = node as ReactElement<Record<string, unknown>>
  return [element, ...nodes(element.props?.children as ReactNode)]
}
function render(kind: 'list' | 'collection' = 'collection') {
  harness.cursor = 0
  return SmpCreatePage({ patientId: 'p', kind })
}
async function settle() {
  for (const effect of harness.pending.splice(0)) effect()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
async function loaded(kind: 'list' | 'collection' = 'collection') {
  render(kind)
  await settle()
  return render(kind)
}
function select(tree: ReactNode, destination = harness.server.baseUrl) {
  const elements = nodes(tree)
  const selector = elements.find((node) => node.type === SmpCollectionListSelector)!
  ;(selector.props.onChange as (values: string[]) => void)(['List/l'])
  ;(elements.find((node) => node.type === DestinationServerField)!.props.onChange as (value: string) => void)(destination)
}
function submit(tree: ReactNode) {
  const form = nodes(tree).find((node) => node.type === 'form')!
  ;(form.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault() {} })
}
function submitButton(tree: ReactNode) { return nodes(tree).find((node) => node.type === 'button' && node.props.type === 'submit')! }

beforeEach(() => {
  vi.clearAllMocks()
  harness.cursor = 0
  harness.cells = []
  harness.pending = []
  harness.load.mockResolvedValue({ patient, options: [{ reference: 'List/l', label: 'Discharge', display: 'Discharge', resource: list }], authors: [] })
  harness.prepare.mockResolvedValue(snapshot)
  harness.match.mockResolvedValue({ patient, warning: '' })
  harness.publish.mockReset().mockResolvedValue({ resourceType: 'DocumentReference', id: 'index' })
})

describe('single-page collection creation', () => {
  it.each([false, true])('creates directly and returns to source Documents (alternate destination: %s)', async (alternate) => {
    select(await loaded(), alternate ? harness.destination.baseUrl : harness.server.baseUrl)
    submit(render())
    await settle()
    expect(harness.prepare).toHaveBeenCalledTimes(1)
    expect(harness.publish).toHaveBeenCalledTimes(1)
    expect(harness.match).toHaveBeenCalledWith(harness.server.baseUrl, alternate ? harness.destination.baseUrl : harness.server.baseUrl, patient)
    expect(harness.navigate).toHaveBeenCalledWith('/patients/p?view=documents')
    expect(harness.notify).toHaveBeenCalledWith(expect.objectContaining({ message: `SMP Collection created successfully on ${alternate ? 'Destination' : 'Source'}.` }))
  })
  it('requires a selection and leaves the form editable on preparation failure', async () => {
    submit(await loaded())
    await settle()
    expect(harness.prepare).not.toHaveBeenCalled()
    expect(nodes(render()).find((node) => node.props.role === 'alert')?.props.children).toContain('at least one List')
    select(render())
    harness.prepare.mockRejectedValueOnce(new Error('Member unavailable'))
    submit(render())
    await settle()
    expect(nodes(render()).find((node) => node.type === 'fieldset')?.props.disabled).toBe(false)
    expect(harness.navigate).not.toHaveBeenCalled()
  })
  it('blocks concurrent submissions', async () => {
    let finish!: (value: unknown) => void
    harness.publish.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    select(await loaded())
    const tree = render()
    submit(tree)
    submit(tree)
    await settle()
    expect(harness.publish).toHaveBeenCalledTimes(1)
    expect(submitButton(render()).props.disabled).toBe(true)
    finish({})
    await settle()
  })
  it('retains the prepared snapshot and locks inputs after a partial save, then retries', async () => {
    harness.publish.mockImplementationOnce(async (_input: unknown, progress: SmpProgress) => {
      progress.bundle = { resourceType: 'Bundle', type: 'collection', id: 'b' }
      throw new Error('Index rejected')
    }).mockResolvedValueOnce({})
    select(await loaded())
    submit(render())
    await settle()
    expect(nodes(render()).find((node) => node.type === 'fieldset')?.props.disabled).toBe(true)
    expect(submitButton(render()).props.children).toBe('Retry indexing')
    expect(submitButton(render()).props.disabled).toBe(false)
    submit(render())
    await settle()
    expect(harness.prepare).toHaveBeenCalledTimes(1)
    expect(harness.match).toHaveBeenCalledTimes(1)
    expect(harness.publish).toHaveBeenCalledTimes(2)
    expect(harness.navigate).toHaveBeenCalledTimes(1)
  })
  it('disables retries for uncertain writes', async () => {
    harness.publish.mockImplementationOnce(async (_input: unknown, progress: SmpProgress) => {
      progress.uncertain = 'Bundle'
      throw new Error('Unknown write outcome')
    })
    select(await loaded())
    submit(render())
    await settle()
    expect(submitButton(render()).props.disabled).toBe(true)
    expect(harness.navigate).not.toHaveBeenCalled()
  })
  it('refreshes changed source choices and retains only still-available selections', async () => {
    select(await loaded())
    harness.prepare.mockRejectedValueOnce(new SmpSourceChangedError('Source changed'))
    harness.load.mockResolvedValueOnce({ patient, options: [], authors: [] })
    submit(render())
    await settle()
    render()
    await settle()
    const selector = nodes(render()).find((node) => node.type === SmpCollectionListSelector)!
    expect(selector.props.values).toEqual([])
    expect(harness.publish).not.toHaveBeenCalled()
  })
  it('keeps the Medication List transfer control and save navigation', async () => {
    const tree = await loaded('list')
    expect(nodes(tree).some((node) => node.type === TransferList)).toBe(true)
    expect(nodes(tree).some((node) => node.type === SmpCollectionListSelector)).toBe(false)
    submit(tree)
    await settle()
    expect(harness.save).toHaveBeenCalledTimes(1)
    expect(harness.navigate).toHaveBeenCalledWith('/patients/p?view=documents')
  })
})

describe('collection preview loading', () => {
  it('loads once on expansion, preserves warnings, and does not couple expansion to selection', async () => {
    const onChange = vi.fn()
    harness.details.mockResolvedValue({ list, bundle: { resourceType: 'Bundle', type: 'collection' }, warning: 'One member unavailable' })
    const preview = () => {
      harness.cursor = 0
      return SmpMedicationListItem({ list, baseUrl: harness.server.baseUrl, patientId: 'p', selection: { checked: false, disabled: false, onChange } })
    }
    let tree = preview()
    await settle()
    expect(harness.details).not.toHaveBeenCalled()
    const toggle = (open: boolean) => (nodes(tree).find((node) => node.type === 'details')!.props.onToggle as (event: unknown) => void)({ currentTarget: { open } })
    toggle(true)
    tree = preview()
    expect(nodes(tree).some((node) => node.props.role === 'status')).toBe(true)
    await settle()
    tree = preview()
    expect(nodes(tree).some((node) => node.props.children === 'One member unavailable')).toBe(true)
    toggle(false)
    tree = preview()
    toggle(true)
    preview()
    await settle()
    expect(harness.details).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })
})
