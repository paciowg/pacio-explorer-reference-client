/** Selects patient device events and composes generic details with interpreted PFE data without owning profile rules. */
import type { Bundle, Device, DeviceRequest, DeviceUseStatement, Resource, Reference } from 'fhir/r4'
import { interpretPfeDeviceRequest } from '../../igs/pacioPfe/deviceRequest'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { formatDate, getCodeableConceptText } from '../../lib/fhir/formatters'
import { buildResourceDetailModel, type ResourceDetailModel, type ResolveResourceReference } from '../../lib/fhir/resourceDetails'
import { getSimpleResourceDisplay } from '../../lib/fhir/resourceDisplay'
import { normalizeBaseUrl } from '../../lib/fhir/url'

export type DeviceRecord = Device | DeviceRequest | DeviceUseStatement
export type DeviceEntry = {
  key: string
  resource: DeviceRecord
  title: string
  dateValue?: string
  deviceReference?: string
  device?: Device
  resolve: ResolveResourceReference
}

function localReference(reference: string | undefined, baseUrl: string) {
  if (!reference) return ''
  const base = normalizeBaseUrl(baseUrl)
  return (reference.startsWith(`${base}/`) ? reference.slice(base.length + 1) : reference).replace(/\/_history\/[^/]+$/, '')
}

export function getPatientDevices(bundle: Bundle | null, patientId: string, baseUrl: string): DeviceEntry[] {
  if (!bundle) return []
  const index = createBundleIndex(bundle, baseUrl)
  const resolve: ResolveResourceReference = (reference, owner) => index.resolve(reference, owner) || index.resolve(localReference(reference, baseUrl), owner)
  const belongs = (reference: Reference | undefined) => localReference(reference?.reference, baseUrl) === `Patient/${patientId}` ||
    (resolve(reference?.reference)?.resourceType === 'Patient' && resolve(reference?.reference)?.id === patientId)
  const resources = (bundle.entry ?? []).flatMap((entry) => entry.resource ? [entry.resource] : [])
  const events = resources.filter((resource): resource is DeviceRequest | DeviceUseStatement =>
    (resource.resourceType === 'DeviceRequest' && belongs((resource as DeviceRequest).subject)) ||
    (resource.resourceType === 'DeviceUseStatement' && belongs((resource as DeviceUseStatement).subject)))
  const linked = new Set(events.map((resource) => resource.resourceType === 'DeviceRequest' ? resource.codeReference : resource.device)
    .map((ref) => ref?.reference?.startsWith('#') ? '' : localReference(ref?.reference, baseUrl)).filter(Boolean))
  const linkedDevices = new Set(events.map((event) => resolve(event.resourceType === 'DeviceRequest' ? event.codeReference?.reference : event.device.reference, event)))
  const devices = resources.filter((resource): resource is Device => resource.resourceType === 'Device' && belongs((resource as Device).patient) &&
    !linked.has(`Device/${resource.id}`) && !linkedDevices.has(resource))
  const seen = new Set<string>()
  return [...events, ...devices].flatMap((resource, position) => {
    const key = resource.id ? `${resource.resourceType}/${resource.id}` : `${resource.resourceType}:${position}`
    if (seen.has(key)) return []
    seen.add(key)
    const ref = resource.resourceType === 'DeviceRequest' ? resource.codeReference : resource.resourceType === 'DeviceUseStatement' ? resource.device : undefined
    const resolved = resolve(ref?.reference, resource)
    const device = resolved?.resourceType === 'Device' ? resolved as Device : undefined
    const date = resource.resourceType === 'DeviceRequest' ? resource.authoredOn : resource.resourceType === 'DeviceUseStatement' ? resource.recordedOn || resource.timingDateTime || resource.timingPeriod?.start : undefined
    return [{ key, resource, title: device ? getSimpleResourceDisplay(device) : getSimpleResourceDisplay(resource), deviceReference: ref?.reference, device, resolve,
      dateValue: date ? formatDate(date) : undefined }]
  })
}

export function deviceEntryDetails(entry: DeviceEntry, device = entry.device): ResourceDetailModel {
  const groups = [...(buildResourceDetailModel(entry.resource, entry.resolve)?.groups ?? [])]
  if (entry.resource.resourceType === 'DeviceRequest') {
    const pfe = interpretPfeDeviceRequest(entry.resource)
    const label = (ref: Reference) => ref.display || (entry.resolve(ref.reference, entry.resource) ? getSimpleResourceDisplay(entry.resolve(ref.reference, entry.resource) as Resource) : ref.reference) || 'Unspecified'
    const fields = [
      { label: 'Preferred locations', values: pfe.locations.map((value) => typeof value === 'string' ? value : getCodeableConceptText(value)) },
      { label: 'Device users', values: pfe.users.map((user) => [label(user.user), ...(user.relationships ?? []).map(getCodeableConceptText)].join(' · ')) },
      { label: 'Additional requester', values: pfe.additionalRequester ? [label(pfe.additionalRequester)] : [] },
      { label: 'Clinical justification', values: pfe.justifications.flatMap((item) => [...(item.notes ?? []), ...(item.assessments ?? []).map((ref) => `Assessment: ${label(ref)}`), ...(item.uses ?? []).map((ref) => `Device usage: ${label(ref)}`), ...(item.goals ?? []).map((ref) => `Goal: ${label(ref)}`)]), multiline: true },
    ].filter((field) => field.values.length)
    if (fields.length) groups.push({ title: 'PFE request details', fields })
  }
  if (device) groups.push(...(buildResourceDetailModel(device, entry.resolve)?.groups ?? []).map((group) => ({ ...group, title: 'Associated Device' })))
  return { groups }
}
