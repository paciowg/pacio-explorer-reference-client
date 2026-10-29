/** Loads a complete live statement and optional reference labels for read-only context, without loading creation choices. */
import type { MedicationStatement, Patient, PractitionerRole, Reference, Resource } from 'fhir/r4'
import { fetchPatient } from '../../lib/fhir/client'
import { readServerResource, serverResourceUrl } from '../../lib/fhir/resourceTransport'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { buildResourceDetailModel, type ResourceDetailModel } from '../../lib/fhir/resourceDetails'
import { formatDate } from '../../lib/fhir/formatters'
import { getResourceSelectionDisplay } from '../../lib/fhir/resourceOptions'
import { samePatient } from '../medicationProfiles/smpReferences'

export type StatementEditData = { patient: Patient; original: MedicationStatement; details: ResourceDetailModel | null }

export async function loadStatementEditData(baseUrl: string, patientId: string, statementId: string): Promise<StatementEditData> {
  const [patient, resource] = await Promise.all([fetchPatient(baseUrl, patientId), readServerResource(baseUrl, `MedicationStatement/${statementId}`)])
  if (resource.resourceType !== 'MedicationStatement' || resource.id !== statementId) throw new Error('The server did not return the requested MedicationStatement.')
  const original = resource as MedicationStatement
  if (patient.id !== patientId || !samePatient(baseUrl, patientId, original.subject?.reference)) throw new Error('This MedicationStatement does not belong to the current patient.')
  const resources: Resource[] = [patient, original]
  const references = [original.medicationReference, original.informationSource, original.context, ...(original.basedOn || []), ...(original.reasonReference || [])]
  const urls = new Set<string>()
  for (const reference of references) {
    if (!reference?.reference) continue
    try { urls.add(serverResourceUrl(baseUrl, reference.reference)) } catch { /* Retain external, contained, and unresolved references as read-only context. */ }
  }
  const results = await Promise.allSettled([...urls].map((url) => readServerResource(baseUrl, url)))
  for (const result of results) if (result.status === 'fulfilled') resources.push(result.value)
  const roles = resources.filter((item) => item.resourceType === 'PractitionerRole') as PractitionerRole[]
  const practitioners = await Promise.allSettled(roles.map(async (role) => {
    if (!role.practitioner?.reference) return undefined
    return readServerResource(baseUrl, role.practitioner.reference)
  }))
  for (const result of practitioners) if (result.status === 'fulfilled' && result.value) resources.push(result.value)
  const resolve = createBundleIndex({ resourceType: 'Bundle', type: 'collection', entry: resources.map((item) => ({ resource: item })) }, baseUrl).resolve
  const model = buildResourceDetailModel(original, resolve)
  const details = model ? { groups: model.groups.map((group) => ({ ...group, fields: group.fields.filter((field) => !['Status', 'Adherence', 'Adherence reason'].includes(field.label)) })) } : null
  const displayReference = (reference: Reference) => {
    const resolved = resolve(reference.reference, original)
    return reference.display || (resolved ? getResourceSelectionDisplay(resolved) : reference.reference) || ''
  }
  if (details && original.context) details.groups[0].fields.push({ label: 'Context', values: [displayReference(original.context)] })
  const notes = details?.groups.flatMap((group) => group.fields).find((field) => field.label === 'Notes')
  if (notes) notes.values = (original.note || []).map((note) => [note.text,
    note.authorString || (note.authorReference ? displayReference(note.authorReference) : ''), note.time ? formatDate(note.time) : ''].filter(Boolean).join(' · '))
  return { patient, original, details }
}
