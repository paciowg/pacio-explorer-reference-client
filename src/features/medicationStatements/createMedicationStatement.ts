/** Publishes a statement after destination reference checks, retaining Patient identity and uncertain write outcomes for safe retries. */
import type { MedicationStatement, Patient, Reference } from 'fhir/r4'
import { buildSmpMedicationStatement, type SmpStatementInput } from '../../igs/pacioSmp/medicationStatement'
import { findDestinationPatient } from '../../lib/fhir/destinationPatient'
import { readServerResource } from '../../lib/fhir/resourceTransport'
import { normalizeBaseUrl } from '../../lib/fhir/url'
import { getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import { sameResourceContent } from '../medicationProfiles/smpReferences'
import { SmpWriteError, writeSmpResource } from '../medicationProfiles/smpPublishing'
import { belongsToStatementPatient, type StatementCreateData } from './statementCreateData'

export type StatementCreationProgress = { patient?: Patient; statement?: MedicationStatement; uncertain?: string; destination?: string }
export type CreateStatementInput = {
  sourceBaseUrl: string; destinationBaseUrl: string; patient: Patient; data: StatementCreateData
  statement: Omit<SmpStatementInput, 'subject'>
}

export async function createPatientMedicationStatement(input: CreateStatementInput, progress: StatementCreationProgress) {
  if (progress.uncertain) throw new Error(`The ${progress.uncertain} write outcome is uncertain. Verify the destination before starting another submission.`)
  const destination = normalizeBaseUrl(input.destinationBaseUrl)
  if (progress.destination && progress.destination !== destination) throw new Error('The destination cannot change after a Patient or statement write.')
  if (progress.statement) return progress.statement
  buildSmpMedicationStatement({ ...input.statement, subject: { reference: 'Patient/pending' } })
  const matched = progress.patient || await findDestinationPatient(input)
  if (!progress.patient && matched?.id !== input.data.patient?.id) throw new Error('The destination Patient match changed. Reload the page to refresh reference choices.')

  const refs: Reference[] = [...(input.statement.basedOn || []), ...(input.statement.reasonReference || []),
    ...[input.statement.context, input.statement.informationSource, input.statement.medicationReference].filter((value): value is Reference => Boolean(value))]
  for (const ref of new Set(refs.map((value) => value.reference))) {
    if (ref === 'Patient/pending') continue
    const option = input.data.options.find((value) => value.reference === ref)
    if (!ref || !option) throw new Error('A selected reference is no longer available on the destination.')
    if (['MedicationRequest', 'Encounter', 'RelatedPerson', 'Condition', 'Observation', 'DiagnosticReport', 'Patient'].includes(option.resource.resourceType) &&
      (!matched?.id || !belongsToStatementPatient(option.resource, matched.id, destination))) throw new Error('Select references for the destination patient.')
    const current = await readServerResource(destination, ref)
    if (!sameResourceContent(current, option.resource)) throw new Error(`${ref} changed. Reload the page before creating the statement.`)
  }

  let stage = 'Patient'
  try {
    progress.destination = destination
    if (!progress.patient) {
      if (matched) progress.patient = matched
      else {
        const copy = structuredClone(input.patient)
        delete copy.id
        delete copy.meta
        progress.patient = await writeSmpResource(destination, copy)
      }
    }
    stage = 'MedicationStatement'
    const subject = { reference: `Patient/${progress.patient.id}`, display: getDisplayNameFromHumanName(progress.patient.name?.[0]) }
    const statement = buildSmpMedicationStatement({ ...input.statement, subject,
      ...(input.statement.informationSource?.reference === 'Patient/pending' ? { informationSource: subject } : {}) })
    progress.statement = await writeSmpResource(destination, statement)
    return progress.statement
  } catch (error) {
    if (error instanceof SmpWriteError && error.uncertain) progress.uncertain = stage
    throw new Error(`${stage} creation failed: ${error instanceof Error ? error.message : 'Unknown error'}${progress.uncertain ? ' Verify the destination before retrying.' : ''}`)
  }
}
