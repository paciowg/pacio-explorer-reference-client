/** Loads an editable live List and creation choices, retaining unavailable original members as removable selections. */
import type { List, MedicationStatement } from 'fhir/r4'
import { isSmpList } from '../../igs/pacioSmp/smp'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { getResourceTransferChoices } from '../../lib/fhir/resourceOptions'
import { readServerResource } from '../../lib/fhir/resourceTransport'
import { loadSmpChoices, statementDisplay } from './smpData'
import { samePatient } from './smpReferences'
import { existingEntryValue, listReferenceKey } from './smpListEditModel'

export type SmpListEditData = Awaited<ReturnType<typeof loadSmpListEditData>>

export async function loadSmpListEditData(baseUrl: string, patientId: string, listId: string) {
  const resource = await readServerResource(baseUrl, `List/${listId}`)
  if (resource.resourceType !== 'List' || resource.id !== listId) throw new Error('The server did not return the requested List.')
  const original = resource as List
  if (!isSmpList(original) || !samePatient(baseUrl, patientId, original.subject?.reference)) throw new Error('This is not a medication List for the selected patient.')
  const choices = await loadSmpChoices(baseUrl, patientId, 'list')
  if (choices.patient.id !== patientId) throw new Error('The server did not return the requested Patient.')
  const resolve = createBundleIndex(choices.bundle, baseUrl).resolve
  const originalKeys = new Set((original.entry || []).map((entry) => listReferenceKey(baseUrl, entry.item.reference)).filter(Boolean))
  const available = choices.options.filter((option) => !originalKeys.has(listReferenceKey(baseUrl, option.reference)))
  const existing = (original.entry || []).map((entry, index) => {
    const reference = entry.item.reference
    const resolved = resolve(reference, original)
    const member = resolved?.resourceType === 'MedicationStatement' ? resolved as MedicationStatement : undefined
    const verified = member && samePatient(baseUrl, patientId, member.subject?.reference)
    const display = verified ? statementDisplay(member, resolve) : entry.item.display || reference || entry.item.identifier?.value || 'Existing statement'
    if (verified) return getResourceTransferChoices([{ reference: existingEntryValue(index), label: display, display, resource: member }], ['MedicationStatement'])[0]
    return { value: existingEntryValue(index), label: `${display} (Existing; unavailable)` }
  })
  return { original, choices, memberOptions: [...getResourceTransferChoices(available.map((option) => ({ ...option, display: option.label })), ['MedicationStatement']), ...existing] }
}
