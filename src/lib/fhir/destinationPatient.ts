/** Provides read-only destination Patient matching and creates a portable copy only through the explicit ensure operation. */
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

export async function findDestinationPatient(input: {
  sourceBaseUrl: string
  destinationBaseUrl: string
  patient: Patient
}): Promise<Patient | null> {
  if (normalizeBaseUrl(input.sourceBaseUrl) === normalizeBaseUrl(input.destinationBaseUrl)) {
    if (!input.patient.id) {
      throw new Error('The source Patient does not have an id.')
    }
    return input.patient
  }

  for (const identifier of input.patient.identifier ?? []) {
    if (!identifier.system || !identifier.value) continue
    const match = firstPatient(await searchPatients(input.destinationBaseUrl, {
      identifier: `${identifier.system}|${identifier.value}`,
    }))
    if (match && !match.id) {
      throw new Error('The destination Patient search returned a Patient without an id.')
    }
    if (match?.id) return match
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
    if (match?.id) return match
  }

  return null
}

export async function ensureDestinationPatient(input: {
  sourceBaseUrl: string
  destinationBaseUrl: string
  patient: Patient
}): Promise<DestinationPatientResult> {
  const match = await findDestinationPatient(input)
  if (match) return { patient: match, created: false }
  return {
    patient: await createPatient(input.destinationBaseUrl, portablePatientCopy(input.patient)),
    created: true,
  }
}
