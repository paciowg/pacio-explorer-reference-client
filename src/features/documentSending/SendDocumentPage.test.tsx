/** Exercises destination-only controls, send navigation, and recovery locks without a browser or external writes. */
import { SubmissionForm, SubmissionErrors } from '../../components/SubmissionForm'
import { PatientFormHeader } from '../../components/PatientFormHeader'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ cursor: 0, cells: [] as unknown[], effects: [] as (() => void)[], load: vi.fn(), send: vi.fn(), navigate: vi.fn(), notify: vi.fn(),
  server: { id: 'source', baseUrl: 'https://source.test/fhir', label: 'Source', lastUsedAt: '' },
  servers: [
    { id: 'source', baseUrl: 'https://source.test/fhir/', label: 'Source alias', lastUsedAt: '' },
    { id: 'destination', baseUrl: 'https://destination.test/fhir', label: 'Destination', lastUsedAt: '' },
  ],
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
vi.mock('../servers/useSavedServers', () => ({ useSavedServers: () => ({ activeServer: harness.server, savedServers: harness.servers }) }))
vi.mock('./sendDocument', async (original) => ({ ...await original<typeof import('./sendDocument')>(), loadSavedDocument: harness.load, sendSavedDocument: harness.send }))
vi.mock('../../lib/routing/routes', () => ({ navigateTo: harness.navigate, getRouteHref: (path: string) => `#${path}` }))
vi.mock('../../lib/routing/routeNotification', () => ({ setRouteNotification: harness.notify }))

import { SendDocumentPage } from './SendDocumentPage'
import { SavedDocumentPreview } from './SavedDocumentPreview'
import { DestinationServerField } from '../servers/DestinationServerField'
import type { DocumentKind } from './sendDocument'
import type { DocumentPublicationProgress } from '../../lib/fhir/documentPublishing'

const servers = [...harness.servers]
const data = { patient: { resourceType: 'Patient', id: 'p', name: [{ text: 'Pat Example' }] }, bundle: { resourceType: 'Bundle', type: 'document', id: 'saved', entry: [] }, documentReference: { resourceType: 'DocumentReference', id: 'index', status: 'current', content: [] }, bundleReference: 'Bundle/saved' }
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  const element = node as ReactElement<Record<string, unknown>>
  if (element.type === PatientFormHeader) return nodes(PatientFormHeader(element.props as Parameters<typeof PatientFormHeader>[0]))
  return [element, ...nodes(element.props?.children as ReactNode)]
}
function render(kind: DocumentKind = 'toc') { harness.cursor = 0; return SendDocumentPage({ patientId: 'p', resourceId: 'index', kind }) }
async function settle(kind: DocumentKind = 'toc') {
  for (let i = 0; i < 2; i++) {
    for (const effect of harness.effects.splice(0)) effect()
    await new Promise((resolve) => setTimeout(resolve, 0))
    render(kind)
  }
  return render(kind)
}
const button = (tree: ReactNode) => nodes(tree).find((node) => node.type === 'button' && node.props.type === 'submit')!
const destination = (tree: ReactNode) => nodes(tree).find((node) => node.type === DestinationServerField)!
function choose(tree: ReactNode) { (destination(tree).props.onChange as (value: string) => void)(servers[1].baseUrl) }
function submit(tree: ReactNode) { (nodes(tree).find((node) => node.type === SubmissionForm)!.props.onSubmit as (event: unknown) => void)({ preventDefault() {} }) }

beforeEach(() => {
  vi.resetAllMocks()
  harness.cursor = 0; harness.cells = []; harness.effects = []; harness.servers = [...servers]
  harness.load.mockResolvedValue(data)
  harness.send.mockResolvedValue({})
})

describe('saved document send page', () => {
  it.each(['toc', 'adi', 'smp'] as const)('previews %s read-only with an explicit destination, excluding the current server', async (kind) => {
    render(kind); const tree = await settle(kind)
    expect(harness.load).toHaveBeenCalledWith(harness.server.baseUrl, 'p', 'index', kind)
    expect(destination(tree).props.servers).toEqual([servers[1]])
    expect(destination(tree).props.value).toBe('')
    expect(button(tree).props.children).toBe('Send to server')
    expect(button(tree).props.disabled).toBe(true)
    expect(nodes(tree).find((node) => node.type === SavedDocumentPreview)?.props).toMatchObject({ data, kind, sourceBase: harness.server.baseUrl })
    expect(nodes(tree).some((node) => node.type === 'input' || node.type === 'textarea')).toBe(false)
    expect(nodes(tree).some((node) => typeof node.props.children === 'string' && /match|Retained destination Patient/i.test(node.props.children))).toBe(false)
  })
  it('sends once on repeated submission and returns to source Documents with the destination named', async () => {
    let finish: (value: unknown) => void = () => {}
    harness.send.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    render(); choose(await settle()); const tree = render()
    submit(tree); submit(tree)
    expect(harness.send).toHaveBeenCalledOnce()
    expect(harness.send.mock.calls[0][0]).toEqual({ sourceBase: harness.server.baseUrl, destinationBase: servers[1].baseUrl, data, kind: 'toc' })
    expect(button(render()).props.disabled).toBe(true)
    finish({}); await settle()
    expect(harness.navigate).toHaveBeenCalledWith('/patients/p?view=documents')
    expect(harness.notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'TOC Document sent successfully to Destination.' }))
  })
  it('retains the snapshot and locks destination selection after a partial send, allowing index retry', async () => {
    harness.send.mockImplementationOnce(async (_input: unknown, progress: DocumentPublicationProgress) => {
      progress.destination = servers[1].baseUrl
      progress.bundle = { resourceType: 'Bundle', type: 'document', id: 'retained' }
      throw new Error('Index rejected')
    })
    render(); choose(await settle()); submit(render()); const tree = await settle()
    expect(destination(tree).props.disabled).toBe(true)
    expect(button(tree).props.disabled).toBe(false)
    expect(nodes(tree).some((node) => node.type === SubmissionErrors && node.props.error === 'Index rejected')).toBe(true)
    submit(tree); await settle()
    expect(harness.load).toHaveBeenCalledOnce()
    expect(harness.send).toHaveBeenCalledTimes(2)
    expect(harness.send.mock.calls[1][1]).toBe(harness.send.mock.calls[0][1])
  })
  it('disables submission after an uncertain outcome', async () => {
    harness.send.mockImplementation(async (_input: unknown, progress: DocumentPublicationProgress) => {
      progress.destination = servers[1].baseUrl
      progress.uncertain = 'Bundle'
      throw new Error('Connection lost')
    })
    render(); choose(await settle()); submit(render()); const tree = await settle()
    expect(button(tree).props.disabled).toBe(true)
    expect(destination(tree).props.disabled).toBe(true)
    submit(tree); await settle()
    expect(harness.send).toHaveBeenCalledOnce()
    expect(harness.navigate).not.toHaveBeenCalled()
  })
  it('provides connection guidance when no other destinations exist', async () => {
    harness.servers = [servers[0]]
    render(); const tree = await settle()
    expect(destination(tree).props.servers).toEqual([])
    expect(destination(tree).props.disabled).toBe(true)
    expect(button(tree).props.disabled).toBe(true)
    expect(nodes(tree).some((node) => node.props.children === 'Connect to another FHIR server to save a destination, then return to this source server.')).toBe(true)
  })
  it('does not expose a send form after load failure and allows a load retry', async () => {
    harness.load.mockRejectedValueOnce(new Error('Patient mismatch'))
    render(); let tree = await settle()
    expect(nodes(tree).some((node) => node.type === SubmissionForm)).toBe(false)
    const retry = nodes(tree).find((node) => node.type === 'button' && node.props.children === 'Retry loading')!
    ;(retry.props.onClick as () => void)()
    render(); tree = await settle()
    expect(button(tree)).toBeDefined()
    expect(harness.load).toHaveBeenCalledTimes(2)
    const back = nodes(tree).find((node) => node.type === 'button' && node.props.children === 'Back to patient')!
    ;(back.props.onClick as () => void)()
    expect(harness.navigate).toHaveBeenCalledWith('/patients/p?view=documents')
    expect(harness.send).not.toHaveBeenCalled()
  })
})
