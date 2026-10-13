/** Constructs and interprets PFE device resources as a pure FHIR R4 reference implementation, independent of UI and transport. */
import type { CodeableConcept, Device, DeviceRequest, Extension, Reference } from 'fhir/r4'

export const PFE_CANONICAL = 'http://hl7.org/fhir/us/pacio-pfe/StructureDefinition/'
export const PFE_DEVICE_PROFILE = `${PFE_CANONICAL}pfe-device`
export const PFE_DEVICE_REQUEST_PROFILE = `${PFE_CANONICAL}pfe-device-request`
export const PFE_LOCATION = `${PFE_CANONICAL}pfe-device-request-location`
export const PFE_USER = `${PFE_CANONICAL}pfe-device-request-user`
export const PFE_JUSTIFICATION = `${PFE_CANONICAL}pfe-device-request-clinical-justification`
export const PFE_ADDITIONAL_REQUESTER = `${PFE_CANONICAL}pfe-device-request-additional-requester`
export const RELATIONSHIP_SYSTEM = 'http://terminology.hl7.org/CodeSystem/deviceassociation-relationship'

// This is a deliberately small demo subset, not a terminology expansion.
export const ASSISTIVE_DEVICES = [
  { code: '58938008', display: 'Wheelchair', name: 'Wheelchair' },
  { code: '87405001', display: 'Cane', name: 'Walking cane' },
  { code: '74566002', display: 'Crutch', name: 'Crutches' },
  { code: '183146002', display: 'Zimmer frame', name: 'Walker' },
  { code: '6012004', display: 'Hearing aid', name: 'Hearing aid' },
] as const

/** Supplies synthetic, type-specific demo metadata; these identifiers are not manufacturer-assigned UDIs. */
export function demoDeviceDefaults(device: typeof ASSISTIVE_DEVICES[number]): {
  deviceName: NonNullable<Device['deviceName']>
  udiCarrier: NonNullable<Device['udiCarrier']>
} {
  const identifier = `DEMO-PFE-${device.code}`
  return { deviceName: [{ name: device.name, type: 'user-friendly-name' }],
    udiCarrier: [{ deviceIdentifier: identifier, carrierHRF: identifier }] }
}

export const DEVICE_PARAMETERS = [
  { code: '103355008', display: 'Width' },
  { code: '260769002', display: 'Material' },
  { code: '364564000', display: 'Range of motion' },
  { code: '278269003', display: 'Frequency' },
  { code: '762636008', display: 'Duration' },
] as const

export function snomedConcept(code: string, display: string): CodeableConcept {
  return { coding: [{ system: 'http://snomed.info/sct', code, display }], text: display }
}

export type DeviceUser = { user: Reference; relationships?: CodeableConcept[] }
export type ClinicalJustification = {
  notes?: string[]
  assessments?: Reference[]
  uses?: Reference[]
  goals?: Reference[]
}
export type PFEDeviceInput = Pick<Device, 'type' | 'deviceName' | 'udiCarrier' | 'owner'> & { patient: Reference }
export type PFEDeviceRequestInput = Pick<DeviceRequest,
  'status' | 'intent' | 'priority' | 'groupIdentifier' | 'encounter' | 'authoredOn' |
  'occurrenceDateTime' | 'occurrencePeriod' | 'occurrenceTiming' | 'requester' |
  'priorRequest' | 'parameter' | 'insurance' | 'note'> & {
  subject: Reference
  device: Reference
  locations?: Array<string | CodeableConcept>
  users?: DeviceUser[]
  justifications?: ClinicalJustification[]
}

// FHIR JSON omits absent elements and empty arrays; false and zero remain meaningful values.
function populated<T extends object>(fields: T): T {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && (!Array.isArray(value) || value.length > 0))) as T
}

export function buildDeviceUserExtension(input: DeviceUser): Extension {
  if (!input.user.reference) throw new Error('A device user must reference a resource.')
  return { url: PFE_USER, extension: [
    { url: 'user', valueReference: input.user },
    ...(input.relationships ?? []).map((valueCodeableConcept) => ({ url: 'relationship', valueCodeableConcept })),
  ] }
}

export function buildClinicalJustificationExtension(input: ClinicalJustification): Extension {
  const extension: Extension[] = [
    ...(input.notes ?? []).filter((note) => note.trim()).map((valueString) => ({ url: 'note', valueString })),
    ...(input.assessments ?? []).map((valueReference) => ({ url: 'assessment', valueReference })),
    ...(input.uses ?? []).map((valueReference) => ({ url: 'use-of-device', valueReference })),
    ...(input.goals ?? []).map((valueReference) => ({ url: 'goal', valueReference })),
  ]
  if (!extension.length) throw new Error('Clinical justification must have content.')
  return { url: PFE_JUSTIFICATION, extension }
}

export function buildPfeDevice(input: PFEDeviceInput): Device {
  if (!input.type?.coding?.length && !input.type?.text?.trim()) throw new Error('Select a device type.')
  if (!input.patient.reference) throw new Error('A patient reference is required.')
  if (input.deviceName?.some((name) => !name.name.trim() || !name.type)) throw new Error('Each device name requires a name and name type.')
  if ((input.udiCarrier?.length ?? 0) > 1) throw new Error('US Core supports at most one UDI carrier.')
  if (input.udiCarrier?.some((udi) => !udi.deviceIdentifier?.trim())) throw new Error('UDI requires a device identifier.')
  if (input.owner?.reference && !/(?:^|\/)Organization\/[A-Za-z0-9.-]+(?:\/_history\/[A-Za-z0-9.-]+)?$/.test(input.owner.reference)) throw new Error('Device owner must be an Organization.')
  return { resourceType: 'Device', meta: { profile: [PFE_DEVICE_PROFILE] }, ...populated({ type: input.type, patient: input.patient,
    deviceName: input.deviceName, udiCarrier: input.udiCarrier, owner: input.owner }) }
}

export function buildPfeDeviceRequest(input: PFEDeviceRequestInput): DeviceRequest {
  if (!input.status || !input.intent || !input.subject.reference || !input.device.reference) throw new Error('Status, intent, patient, and device references are required.')
  if ([input.occurrenceDateTime, input.occurrencePeriod, input.occurrenceTiming].filter(Boolean).length > 1) throw new Error('Choose one occurrence representation.')
  for (const parameter of input.parameter ?? []) {
    if (!parameter.code) throw new Error('Each device parameter requires a code.')
    if ([parameter.valueBoolean, parameter.valueCodeableConcept, parameter.valueQuantity, parameter.valueRange].filter((value) => value !== undefined).length > 1) throw new Error('Choose one parameter value representation.')
  }
  const { device, locations, users, justifications } = input
  // Explicit fields keep forbidden legacy performer elements out even when callers pass wider objects.
  const fields = { status: input.status, intent: input.intent, subject: input.subject, priority: input.priority,
    groupIdentifier: input.groupIdentifier, encounter: input.encounter, authoredOn: input.authoredOn,
    occurrenceDateTime: input.occurrenceDateTime, occurrencePeriod: input.occurrencePeriod, occurrenceTiming: input.occurrenceTiming,
    requester: input.requester, priorRequest: input.priorRequest, parameter: input.parameter, insurance: input.insurance, note: input.note }
  const extension: Extension[] = [
    ...(locations ?? []).map((location) => typeof location === 'string'
      ? { url: PFE_LOCATION, valueString: location }
      : { url: PFE_LOCATION, valueCodeableConcept: location }),
    ...(users ?? []).map(buildDeviceUserExtension),
    ...(justifications ?? []).map(buildClinicalJustificationExtension),
  ]
  return { resourceType: 'DeviceRequest', meta: { profile: [PFE_DEVICE_REQUEST_PROFILE] }, ...populated(fields),
    codeReference: device, ...(extension.length ? { extension } : {}) }
}

/** Preserves structured extension data for callers to resolve references and choose their own presentation. */
export function interpretPfeDeviceRequest(resource: DeviceRequest) {
  const locations: Array<string | CodeableConcept> = []
  const users: DeviceUser[] = []
  const justifications: ClinicalJustification[] = []
  for (const extension of resource.extension ?? []) {
    if (extension.url === PFE_LOCATION) {
      const value = extension.valueString ?? extension.valueCodeableConcept
      if (value) locations.push(value)
    }
    if (extension.url === PFE_USER) {
      const user = extension.extension?.find((child) => child.url === 'user')?.valueReference
      if (user) users.push({ user, relationships: extension.extension?.filter((child) => child.url === 'relationship' && child.valueCodeableConcept).map((child) => child.valueCodeableConcept!) })
    }
    if (extension.url === PFE_JUSTIFICATION) {
      const children = extension.extension ?? []
      const refs = (url: string) => children.filter((child) => child.url === url && child.valueReference).map((child) => child.valueReference!)
      justifications.push({ notes: children.filter((child) => child.url === 'note').map((child) => child.valueString ?? child.valueAnnotation?.text ?? '').filter(Boolean),
        assessments: refs('assessment'), uses: refs('use-of-device'), goals: refs('goal') })
    }
  }
  const additionalRequester = resource.requester?.extension?.find((extension) => extension.url === PFE_ADDITIONAL_REQUESTER)?.valueReference
  return { locations, users, justifications, additionalRequester }
}
