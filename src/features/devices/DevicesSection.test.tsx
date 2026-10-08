/** Verifies that device resource types are visible before disclosure and PFE form controls render accessible labels. */
import { renderToStaticMarkup } from 'react-dom/server'
import type { DeviceRequest } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { DevicesSection } from './DevicesSection'
import { getPatientDevices } from './deviceModel'
import { DeviceRequestForm } from './DeviceRequestForm'
import { initialDeviceForm } from './deviceFormModel'

describe('device UI markup', () => {
  it('renders resource type inside collapsed summaries and includes the creation action', () => {
    const request: DeviceRequest = { resourceType: 'DeviceRequest', id: 'r', intent: 'order', status: 'draft', subject: { reference: 'Patient/p' }, codeCodeableConcept: { text: 'Walker' } }
    const entries = getPatientDevices({ resourceType: 'Bundle', type: 'collection', entry: [{ resource: request }] }, 'p', 'https://example.test')
    const html = renderToStaticMarkup(<DevicesSection entries={entries} baseUrl="https://example.test" patientId="p" emptyMessage="None recorded" />)
    expect(html.slice(html.indexOf('<summary>'), html.indexOf('</summary>'))).toContain('DeviceRequest')
    expect(html).not.toContain('<details open')
    expect(html).toContain('Create Device Request')
  })
  it('shows the unavailable state and renders the Required/Must Support form groups', () => {
    expect(renderToStaticMarkup(<DevicesSection entries={[]} baseUrl="https://example.test" patientId="p" emptyMessage="Unavailable" />)).toContain('Unavailable')
    const html = renderToStaticMarkup(<DeviceRequestForm value={initialDeviceForm()} options={[]} disabled={false} deviceLocked={false} onChange={() => {}} />)
    for (const label of ['UDI device identifier', 'Organization responsible', 'Requester', 'Occurrence', 'Parameters', 'Device users', 'Supporting assessments', 'Prior requests', 'Insurance']) expect(html).toContain(label)
  })
})
