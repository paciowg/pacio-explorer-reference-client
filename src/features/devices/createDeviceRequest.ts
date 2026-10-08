/** Coordinates separate Device and DeviceRequest writes, retaining a created Device for safe in-session retries. */
import type { Device, Patient } from 'fhir/r4'
import { buildPfeDevice, buildPfeDeviceRequest, type PFEDeviceInput, type PFEDeviceRequestInput } from '../../igs/pacioPfe/deviceRequest'
import { ensureDestinationPatient } from '../../lib/fhir/destinationPatient'
import { createDevice, createDeviceRequest } from '../../lib/fhir/deviceTransport'

export type DeviceCreationProgress = { patient?: Patient; device?: Device; uncertain?: boolean }
export type CreateDeviceRequestInput = {
  sourceBaseUrl: string
  destinationBaseUrl: string
  patient: Patient
  device: Omit<PFEDeviceInput, 'patient'>
  request: Omit<PFEDeviceRequestInput, 'subject' | 'device'>
}

export async function createPatientDeviceRequest(input: CreateDeviceRequestInput, progress: DeviceCreationProgress) {
  if (progress.uncertain) throw new Error('A previous write has an uncertain outcome. Verify the destination before starting a new submission.')
  // Validate both resources before the first write; a placeholder reference is replaced after Device creation.
  const subject = { reference: `Patient/${input.patient.id || 'pending'}` }
  buildPfeDevice({ ...input.device, patient: subject })
  buildPfeDeviceRequest({ ...input.request, subject, device: { reference: 'Device/pending' } })
  if (!progress.patient) progress.patient = (await ensureDestinationPatient(input)).patient
  const destinationSubject = { reference: `Patient/${progress.patient.id}` }
  const request = { ...input.request, users: input.request.users?.map((user) => ({ ...user,
    user: user.user.reference === 'Patient/pending' ? destinationSubject : user.user })) }
  if (!progress.device) {
    try {
      progress.device = await createDevice(input.destinationBaseUrl, buildPfeDevice({ ...input.device, patient: destinationSubject }))
    } catch (error) {
      // Network failures and missing IDs can follow a successful write; automatic retry could duplicate it.
      if (error instanceof TypeError || error instanceof SyntaxError || (error instanceof Error && error.message.includes('accepted'))) progress.uncertain = true
      throw error
    }
  }
  try {
    return await createDeviceRequest(input.destinationBaseUrl, buildPfeDeviceRequest({ ...request, subject: destinationSubject,
      device: { reference: `Device/${progress.device.id}`, display: progress.device.deviceName?.[0]?.name } }))
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError || (error instanceof Error && error.message.includes('accepted'))) progress.uncertain = true
    throw new Error(`Device/${progress.device.id} remains on the destination. DeviceRequest creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
