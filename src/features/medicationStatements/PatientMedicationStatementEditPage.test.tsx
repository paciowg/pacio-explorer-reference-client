/** Exercises update-page submission/navigation and confirms update entry points belong only to the patient's Medications section. */
import type { ReactElement, ReactNode } from 'react'
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
vi.mock('./statementEditData', () => ({ loadStatementEditData: harness.load }))
vi.mock('../../lib/fhir/resourceTransport', async (original) => ({ ...await original<typeof import('../../lib/fhir/resourceTransport')>(), updateResource: harness.save }))
vi.mock('../../lib/routing/routes', () => ({ navigateTo: harness.navigate, getRouteHref: (path: string) => `#${path}` }))
vi.mock('../../lib/routing/routeNotification', () => ({ setRouteNotification: harness.notify }))

import { PatientMedicationStatementEditPage } from './PatientMedicationStatementEditPage'
import { MedicationStatementEditForm } from './MedicationStatementEditForm'
import { PatientSummaryPage } from '../patientSummary/PatientSummaryPage'
import { ClinicalSummarySection } from '../../components/ClinicalSummarySection'
import { buildPatientSummaryModel } from '../patientSummary/patientSummaryModel'
import { externalMedicationStatement as original } from '../../test/fixtures/externalMedicationStatement'
import { FhirUpdateError } from '../../lib/fhir/resourceTransport'
import type { StatementEdit } from './statementEditModel'

const patient = { resourceType: 'Patient' as const, id: 'p', name: [{ text: 'Pat Example' }] }
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  const element = node as ReactElement<Record<string, unknown>>
  return [element, ...nodes(element.props?.children as ReactNode)]
}
function render() { harness.cursor = 0; return PatientMedicationStatementEditPage({ patientId: 'p', statementId: original.id! }) }
async function settle() {
  for (let i = 0; i < 2; i++) {
    for (const effect of harness.effects.splice(0)) effect()
    await new Promise((resolve) => setTimeout(resolve, 0))
    render()
  }
  return render()
}
const form = (tree: ReactNode) => nodes(tree).find((node) => node.type === MedicationStatementEditForm)!
const button = (tree: ReactNode) => nodes(tree).find((node) => node.type === 'button' && node.props.type === 'submit')!
function change(tree: ReactNode, patch: Partial<StatementEdit>) {
  const current = form(tree)
  ;(current.props.onChange as (value: StatementEdit) => void)({ ...(current.props.value as StatementEdit), ...patch })
}
function submit(tree: ReactNode) {
  const element = nodes(tree).find((node) => node.type === 'form')!
  ;(element.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault() {} })
}
beforeEach(() => {
  vi.resetAllMocks()
  harness.cursor = 0; harness.cells = []; harness.effects = []
  harness.load.mockResolvedValue({ patient, original, details: null })
  harness.save.mockResolvedValue(original)
})

describe('statement update page', () => {
  it('leaves unchanged saves disabled and sends no write on a programmatic unchanged submission', async () => {
    render(); const tree = await settle()
    expect(button(tree).props.disabled).toBe(true)
    submit(tree); await settle()
    expect(harness.save).not.toHaveBeenCalled()
  })
  it('preserves the original, submits once, and returns to Clinical Information with a success message', async () => {
    render(); let tree = await settle()
    change(tree, { status: 'on-hold', newNote: 'Updated report' })
    tree = render()
    expect(button(tree).props.disabled).toBe(false)
    submit(tree); submit(tree); tree = await settle()
    expect(harness.save).toHaveBeenCalledOnce()
    expect(harness.save.mock.calls[0][0]).toBe(harness.server.baseUrl)
    expect(harness.save.mock.calls[0][1]).toEqual({ ...original, status: 'on-hold', note: [...original.note!, { text: 'Updated report', time: expect.any(String) }] })
    expect(harness.navigate).toHaveBeenCalledWith('/patients/p?view=clinical')
    expect(harness.notify).toHaveBeenCalledWith(expect.objectContaining({ routeHref: '#/patients/p?view=clinical', message: 'MedicationStatement updated successfully on Source.' }))
    submit(tree); await settle()
    expect(harness.save).toHaveBeenCalledOnce()
  })
  it('preserves edits after definite server rejection and permits a deliberate retry', async () => {
    harness.save.mockRejectedValueOnce(new FhirUpdateError('Statement rejected', false))
    render(); let tree = await settle()
    change(tree, { newNote: 'Keep this note' })
    submit(render()); tree = await settle()
    expect(button(tree).props.disabled).toBe(false)
    expect(form(tree).props.value).toMatchObject({ newNote: 'Keep this note' })
    expect(harness.navigate).not.toHaveBeenCalled()
    submit(tree); await settle()
    expect(harness.save).toHaveBeenCalledTimes(2)
    expect(harness.save.mock.calls[1][1].note).toHaveLength(original.note!.length + 1)
  })
  it('locks editing and blocks further writes after an uncertain update', async () => {
    harness.save.mockRejectedValueOnce(new FhirUpdateError('Connection lost', true))
    render(); let tree = await settle()
    change(tree, { adherence: 'not-taking' })
    submit(render()); tree = await settle()
    expect(button(tree).props.disabled).toBe(true)
    expect(form(tree).props.disabled).toBe(true)
    submit(tree); await settle()
    expect(harness.save).toHaveBeenCalledOnce()
    expect(harness.navigate).not.toHaveBeenCalled()
  })
  it('offers no editing controls on load failure, and Back returns without saving', async () => {
    harness.load.mockRejectedValue(new Error('Wrong patient'))
    render(); const tree = await settle()
    expect(form(tree)).toBeUndefined()
    const back = nodes(tree).find((node) => node.type === 'button' && node.props.children === 'Back to patient')!
    ;(back.props.onClick as () => void)()
    expect(harness.navigate).toHaveBeenCalledWith('/patients/p?view=clinical')
    expect(harness.save).not.toHaveBeenCalled()
  })
})

describe('patient update entry point', () => {
  it('supplies update actions only to Medications, for standalone MedicationStatements with an id', () => {
    harness.cells[0] = buildPatientSummaryModel({ patient, bundle: { resourceType: 'Bundle', type: 'collection', entry: [{ resource: patient }, { resource: original }] }, bundleAvailable: true, baseUrl: harness.server.baseUrl })
    harness.cursor = 0
    const tree = PatientSummaryPage({ patientId: 'p', view: 'clinical' })
    const sections = nodes(tree).filter((node) => node.type === ClinicalSummarySection)
    expect(sections.filter((node) => node.props.renderItemActions)).toHaveLength(1)
    const medications = sections.find((node) => node.props.title === 'Medications')!
    const action = medications.props.renderItemActions as (resource: { resourceType: string; id?: string }) => ReactElement<Record<string, unknown>> | null
    const update = action(original)!
    expect(update.props.children).toBe('Update Medication Statement')
    ;(update.props.onClick as () => void)()
    expect(harness.navigate).toHaveBeenCalledWith('/patients/p/medication-statements/external-statement/edit')
    expect(action({ resourceType: 'MedicationStatement' })).toBeNull()
    expect(action({ resourceType: 'Medication', id: 'm' })).toBeNull()
  })
})
