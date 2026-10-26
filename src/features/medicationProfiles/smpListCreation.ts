/** Saves source-server Lists with patient and freshness checks, without requiring imported statements to pass SMP profile checks. */
import type { Identifier, List, MedicationStatement, Resource } from 'fhir/r4'
import { buildSmpMedicationList } from '../../igs/pacioSmp/smp'
import { getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import { readServerResource } from '../../lib/fhir/resourceTransport'
import type { SmpChoices } from './smpData'
import { samePatient, sameResourceContent, SmpSourceChangedError } from './smpReferences'
import { SmpWriteError, writeSmpResource } from './smpPublishing'

export type SmpListSaveProgress = { list?: List; uncertain?: boolean }
export type SmpListCreationInput = {
  baseUrl: string; patientId: string; choices: SmpChoices; identifier: Identifier
  title: string; typeCode: string; date: string; notes: string; author: string; selected: string[]; emptyReason?: string
}

export async function saveSmpMedicationList(input: SmpListCreationInput, progress: SmpListSaveProgress) {
  if (progress.uncertain) throw new Error('Verify the source server after the uncertain List write before starting another submission.')
  if (progress.list) return progress.list
  if (input.choices.patient.id !== input.patientId) throw new Error('Source choices do not belong to the current patient.')
  const options = input.selected.map((ref) => {
    const option = input.choices.options.find((o) => o.reference === ref)
    if (!option) throw new SmpSourceChangedError(`${ref} is unavailable. Choices are refreshing; review and submit again.`)
    if (option.resource.resourceType !== 'MedicationStatement' || !samePatient(input.baseUrl, input.patientId, (option.resource as MedicationStatement).subject?.reference)) throw new Error('Select MedicationStatements for the current patient.')
    return option
  })
  const source = input.choices.authors.find((a) => a.reference === input.author)
  if (!source) throw new Error('Select the List author.')
  const list = buildSmpMedicationList({ identifier: input.identifier, title: input.title, typeCode: input.typeCode, date: input.date, notes: input.notes,
    patient: { reference: `Patient/${input.patientId}`, display: getDisplayNameFromHumanName(input.choices.patient.name?.[0]) },
    source: { reference: source.reference, display: source.display }, statements: options.map((o) => ({ reference: o.reference, display: o.display })), emptyReason: input.emptyReason })
  // Only selected statements and their author must remain unchanged; medication lookups are optional label enrichment.
  const checks = new Map<string, Resource>(options.map((o) => [o.reference, o.resource]))
  checks.set(source.reference, source.resource)
  for (const [reference, original] of checks) {
    const current = await readServerResource(input.baseUrl, reference)
    if (!sameResourceContent(current, original)) throw new SmpSourceChangedError(`${reference} changed. Choices are refreshing; review and submit again.`)
  }
  try { progress.list = await writeSmpResource(input.baseUrl, list); return progress.list }
  catch (error) { if (error instanceof SmpWriteError && error.uncertain) progress.uncertain = true; throw error }
}
