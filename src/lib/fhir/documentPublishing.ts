/** Shares destination matching and staged publication across document creation and sending; callers own Bundle preparation. */
import type { Bundle, CapabilityStatement, DocumentReference, Patient } from 'fhir/r4'
import { withUrnUuidBundleReferences } from './bundleReferences'
import { validateFhirServer } from './client'
import { closeBundleReferences } from './closedBundle'
import { ensureDestinationPatient, findDestinationPatient } from './destinationPatient'
import { createResourceWithOutcome, FhirCreateError } from './resourceTransport'
import { normalizeBaseUrl } from './url'

export type PublishDocumentInput = {
  sourceBaseUrl: string
  destinationBaseUrl: string
  patient: Patient
  bundle: Bundle
  buildDocumentReference: (bundleUrl: string, destinationPatient: Patient) => DocumentReference
  missingBundleIdMessage: string
}

export type DocumentPublicationProgress = { destination?: string; patient?: Patient; bundle?: Bundle; index?: DocumentReference; uncertain?: string }
export type DestinationMatch = { patient?: Patient; warning: string }
type PreparedDocumentInput = {
  destinationBaseUrl: string
  bundle: Bundle
  ensurePatient: () => Promise<Patient>
  buildDocumentReference: PublishDocumentInput['buildDocumentReference']
  missingBundleIdMessage?: string
}

/** Sends an already-prepared Bundle unchanged and retains completed stages for safe in-session retries. */
export async function publishPreparedDocument(input: PreparedDocumentInput, progress: DocumentPublicationProgress = {}) {
  const destination = normalizeBaseUrl(input.destinationBaseUrl)
  if (progress.destination && progress.destination !== destination) throw new Error('The destination cannot change after sending has started.')
  if (progress.uncertain) throw new Error('Verify the destination server before starting another submission; the previous write outcome is uncertain.')
  if (progress.index) return progress.index
  let stage = 'Patient'
  try {
    if (!progress.patient) progress.patient = await input.ensurePatient()
    progress.destination = destination
    stage = 'Bundle'
    if (!progress.bundle) progress.bundle = await createResourceWithOutcome(input.destinationBaseUrl, input.bundle)
    if (!progress.bundle.id) throw new FhirCreateError(input.missingBundleIdMessage || 'The server did not return an id for the created Bundle.', true)
    stage = 'DocumentReference'
    const bundleUrl = `${destination}/Bundle/${progress.bundle.id}`
    progress.index = await createResourceWithOutcome(input.destinationBaseUrl, input.buildDocumentReference(bundleUrl, progress.patient))
    return progress.index
  } catch (error) {
    if (error instanceof FhirCreateError && error.uncertain) {
      progress.destination = destination
      progress.uncertain = stage
    }
    throw error
  }
}

function capabilityWarnings(capability: CapabilityStatement, needsPatientCreate: boolean, needsPatientSearch = true) {
  const resources = capability.rest?.filter((r) => r.mode === 'server').flatMap((r) => r.resource || []) || []
  const warnings: string[] = []
  for (const [type, interaction] of [['Bundle', 'create'], ['DocumentReference', 'create'], ...(needsPatientSearch ? [['Patient', 'search-type']] : []), ...(needsPatientCreate ? [['Patient', 'create']] : [])]) {
    const resource = resources.find((r) => r.type === type)
    if (resource?.interaction && !resource.interaction.some((i) => i.code === interaction)) throw new Error(`Destination does not support ${interaction} on ${type}.`)
    if (!resource?.interaction) warnings.push(`Destination did not declare ${type} ${interaction} support.`)
  }
  return warnings.join(' ')
}

export async function matchDocumentPatient(sourceBase: string, destinationBase: string, patient: Patient): Promise<DestinationMatch> {
  const capability = await validateFhirServer(destinationBase)
  if (normalizeBaseUrl(sourceBase) === normalizeBaseUrl(destinationBase)) return { patient, warning: capabilityWarnings(capability, false, false) }
  const matched = await findDestinationPatient({ sourceBaseUrl: sourceBase, destinationBaseUrl: destinationBase, patient })
  return { patient: matched || undefined, warning: capabilityWarnings(capability, !matched) }
}

/**
 * Keeps the Bundle and DocumentReference as deliberate separate writes. If indexing fails,
 * the already-created document remains available on the server.
 */
export async function publishDocument(input: PublishDocumentInput) {
  const closedBundle = await closeBundleReferences(input.sourceBaseUrl, input.bundle)
  const portableBundle = withUrnUuidBundleReferences(closedBundle)
  return publishPreparedDocument({ ...input, bundle: portableBundle, ensurePatient: async () => (await ensureDestinationPatient({
    sourceBaseUrl: input.sourceBaseUrl, destinationBaseUrl: input.destinationBaseUrl, patient: input.patient,
  })).patient })
}
