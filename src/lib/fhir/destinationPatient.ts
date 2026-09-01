/** Matches a source Patient on a destination FHIR server and creates a portable copy when absent. */
import type { Bundle, Patient } from 'fhir/r4'
import { createPatient, searchPatients } from './client'
import { normalizeBaseUrl } from './url'

export type DestinationPatientResult = {
  patient: Patient
  created: boolean
}

function firstPatient(bundle: Bundle) {
  return bundle.entry
    ?.map((entry) => entry.resource)
    .find((resource): resource is Patient => resource?.resourceType === 'Patient')
}

function portablePatientCopy(patient: Patient) {
  const copy = JSON.parse(JSON.stringify(patient)) as Patient
  delete copy.id
  delete copy.meta
  return copy
}

export async function ensureDestinationPatient(input: {
  sourceBaseUrl: string
  destinationBaseUrl: string
  patient: Patient
}): Promise<DestinationPatientResult> {
  if (normalizeBaseUrl(input.sourceBaseUrl) === normalizeBaseUrl(input.destinationBaseUrl)) {
    if (!input.patient.id) {
      throw new Error('The source Patient does not have an id.')
    }
    return { patient: input.patient, created: false }
  }

  for (const identifier of input.patient.identifier ?? []) {
    if (!identifier.system || !identifier.value) continue
    const match = firstPatient(await searchPatients(input.destinationBaseUrl, {
      identifier: `${identifier.system}|${identifier.value}`,
    }))
    if (match && !match.id) {
      throw new Error('The destination Patient search returned a Patient without an id.')
    }
    if (match?.id) return { patient: match, created: false }
  }

  const patientName = input.patient.name?.find(
    (name) => Boolean(name.family?.trim() && name.given?.find((given) => given.trim())),
  )
  const givenName = patientName?.given?.find((given) => given.trim())
  if (patientName?.family && givenName) {
    const match = firstPatient(await searchPatients(input.destinationBaseUrl, {
      family: patientName.family,
      given: givenName,
    }))
    if (match && !match.id) {
      throw new Error('The destination Patient search returned a Patient without an id.')
    }
    if (match?.id) return { patient: match, created: false }
  }

  return {
    patient: await createPatient(input.destinationBaseUrl, portablePatientCopy(input.patient)),
    created: true,
  }
}
