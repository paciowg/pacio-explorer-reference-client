/** Exercises create-page loading, destination changes, navigation, and duplicate/uncertain submission guards without a browser. */
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ cursor: 0, cells: [] as unknown[], effects: [] as (() => void)[],
  patient: vi.fn(), load: vi.fn(), create: vi.fn(), navigate: vi.fn(), notify: vi.fn(),
  server: { baseUrl: 'https://source.test/fhir', label: 'Source' }, destination: { baseUrl: 'https://destination.test/fhir', label: 'Destination' },
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
vi.mock('../servers/useSavedServers', () => ({ useSavedServers: () => ({ activeServer: harness.server, savedServers: [harness.server, harness.destination] }) }))
vi.mock('../../lib/fhir/client', () => ({ fetchPatient: harness.patient }))
vi.mock('./statementCreateData', async (original) => ({ ...await original<typeof import('./statementCreateData')>(), loadStatementCreateData: harness.load }))
vi.mock('./createMedicationStatement', () => ({ createPatientMedicationStatement: harness.create }))
vi.mock('../../lib/routing/routes', () => ({ navigateTo: harness.navigate, getRouteHref: (path: string) => `#${path}` }))
vi.mock('../../lib/routing/routeNotification', () => ({ setRouteNotification: harness.notify }))

import { PatientMedicationStatementCreatePage } from './PatientMedicationStatementCreatePage'
import { MedicationStatementForm } from './MedicationStatementForm'
import { DestinationServerField } from '../servers/DestinationServerField'
import { catalogMedication } from '../../igs/pacioSmp/medicationStatement'
import type { StatementForm } from './statementFormModel'
import type { StatementCreationProgress } from './createMedicationStatement'

function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  const element = node as ReactElement<Record<string, unknown>>
  return [element, ...nodes(element.props?.children as ReactNode)]
}
function render() { harness.cursor = 0; return PatientMedicationStatementCreatePage({ patientId: 'p' }) }
async function settle() {
  for (let i = 0; i < 3; i++) {
    for (const effect of harness.effects.splice(0)) effect()
    await new Promise((resolve) => setTimeout(resolve, 0))
    render()
  }
  return render()
}
function field(tree: ReactNode) { return nodes(tree).find((node) => node.type === MedicationStatementForm)! }
function destination(tree: ReactNode) { return nodes(tree).find((node) => node.type === DestinationServerField)! }
function update(tree: ReactNode, values: Partial<StatementForm>) {
  const form = field(tree)
  ;(form.props.onChange as (value: StatementForm) => void)({ ...(form.props.value as StatementForm), ...values })
}
function submit(tree: ReactNode) {
  const form = nodes(tree).find((node) => node.type === 'form')!
  ;(form.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault() {} })
}
beforeEach(() => {
  vi.resetAllMocks()
  harness.cursor = 0; harness.cells = []; harness.effects = []
  const patient = { resourceType: 'Patient', id: 'p', name: [{ text: 'Pat Example' }] }
  harness.patient.mockResolvedValue(patient)
  harness.load.mockResolvedValue({ patient, options: [], requests: [], warning: '' })
  harness.create.mockResolvedValue({ resourceType: 'MedicationStatement', id: 'saved' })
})

describe('statement create page', () => {
  it.each([false, true])('submits once and returns to source Clinical Information (alternate: %s)', async (alternate) => {
    render()
    let tree = await settle()
    if (alternate) {
      ;(destination(tree).props.onChange as (value: string) => void)(harness.destination.baseUrl)
      render(); tree = await settle()
    }
    update(tree, { status: 'active', medication: { medicationCodeableConcept: catalogMedication('313782') } })
    tree = render()
    submit(tree); submit(tree)
    await settle()
    expect(harness.create).toHaveBeenCalledOnce()
    expect(harness.create.mock.calls[0][0].destinationBaseUrl).toBe(alternate ? harness.destination.baseUrl : harness.server.baseUrl)
    expect(harness.navigate).toHaveBeenCalledWith('/patients/p?view=clinical')
    expect(harness.notify).toHaveBeenCalledWith(expect.objectContaining({ routeHref: '#/patients/p?view=clinical', message: expect.stringContaining(alternate ? 'Destination' : 'Source') }))
  })
  it('clears copied medication, dosage, and resource references immediately when destination changes', async () => {
    render(); let tree = await settle()
    update(tree, { basedOn: 'MedicationRequest/r', medication: { medicationCodeableConcept: catalogMedication('313782') }, dosage: [{ text: 'Copied' }],
      informationSource: 'Patient/p', context: 'Encounter/e', reasonReferences: ['Condition/c'] })
    tree = render()
    ;(destination(tree).props.onChange as (value: string) => void)(harness.destination.baseUrl)
    tree = render()
    expect(field(tree)).toBeUndefined()
    tree = await settle()
    expect(field(tree).props.value).toMatchObject({ basedOn: '', medication: {}, dosage: [], informationSource: '', context: '', reasonReferences: [] })
  })
  it('preserves manually selected catalog medication and authored dosage across destination changes', async () => {
    render(); let tree = await settle()
    update(tree, { medication: { medicationCodeableConcept: catalogMedication('313782') }, dosage: [{ text: 'Entered instructions' }] })
    tree = render()
    ;(destination(tree).props.onChange as (value: string) => void)(harness.destination.baseUrl)
    render(); tree = await settle()
    expect(field(tree).props.value).toMatchObject({ medication: { medicationCodeableConcept: catalogMedication('313782') }, dosage: [{ text: 'Entered instructions' }] })
  })
  it('locks destination after Patient creation and prevents retry after an uncertain statement write', async () => {
    render(); let tree = await settle()
    update(tree, { status: 'active', medication: { medicationCodeableConcept: catalogMedication('313782') } })
    harness.create.mockImplementation(async (_input, progress: StatementCreationProgress) => {
      progress.patient = { resourceType: 'Patient', id: 'retained' }; progress.uncertain = 'MedicationStatement'; throw new Error('Uncertain write')
    })
    submit(render()); tree = await settle()
    expect(destination(tree).props.disabled).toBe(true)
    expect(field(tree).props.disabled).toBe(true)
    submit(tree); await settle()
    expect(harness.create).toHaveBeenCalledOnce()
    expect(harness.navigate).not.toHaveBeenCalled()
  })
})
