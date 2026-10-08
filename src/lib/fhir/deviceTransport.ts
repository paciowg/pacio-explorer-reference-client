/** Supplies device-specific write wrappers over generic FHIR transport, retaining the existing device interface. */
import type { Device, DeviceRequest } from 'fhir/r4'
import { createResource } from './resourceTransport'
export { readServerResource, searchResources, serverResourceUrl } from './resourceTransport'

export const createDevice = (baseUrl: string, device: Device) => createResource(baseUrl, device)
export const createDeviceRequest = (baseUrl: string, request: DeviceRequest) => createResource(baseUrl, request)
