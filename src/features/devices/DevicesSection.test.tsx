/** Verifies device summaries, accessible PFE form controls, and read-only demo details matching submitted data. */
import { renderToStaticMarkup } from 'react-dom/server'
import type { DeviceRequest, Practitioner, PractitionerRole } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { DevicesSection } from './DevicesSection'
import { getPatientDevices } from './deviceModel'
import { DeviceRequestForm } from './DeviceRequestForm'
import { deviceFormInputs, initialDeviceForm } from './deviceFormModel'
import { ASSISTIVE_DEVICES } from '../../igs/pacioPfe/deviceRequest'
import { getRolePreferredReferenceOptions } from '../../lib/fhir/resourceOptions'

describe('device UI markup', () => {
  it('offers roles instead of paired practitioners in both Requester and Device Users', () => {
    const resources = new Map<string, Practitioner | PractitionerRole>([
      ['Practitioner/paired', { resourceType: 'Practitioner', id: 'paired', name: [{ text: 'Alex Smith' }] }],
      ['Practitioner/standalone', { resourceType: 'Practitioner', id: 'standalone', name: [{ text: 'Jamie Jones' }] }],
      ['PractitionerRole/physician', { resourceType: 'PractitionerRole', id: 'physician', practitioner: { reference: 'Practitioner/paired' }, code: [{ text: 'Physician' }] }],
    ])
    const options = getRolePreferredReferenceOptions(resources, 'https://destination.test/fhir')
    const form = { ...initialDeviceForm(), requester: 'PractitionerRole/physician', users: [{ reference: 'PractitionerRole/physician', relationship: '' }] }
    const html = renderToStaticMarkup(<DeviceRequestForm value={form} options={options} disabled={false} deviceLocked={false} onChange={() => {}} />)
    for (const label of ['Requester', 'User 1']) {
      const select = html.slice(html.indexOf(`<label>${label}<select`)).split('</select>')[0]
      expect(select).toContain('value="PractitionerRole/physician"')
      expect(select).toContain('Alex Smith — Physician')
      expect(select).toContain('value="Practitioner/standalone"')
      expect(select).not.toContain('value="Practitioner/paired"')
    }
    const input = deviceFormInputs(form, options)
    expect(input.request.requester?.reference).toBe('PractitionerRole/physician')
    expect(input.request.users?.[0].user.reference).toBe('PractitionerRole/physician')
  })
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
    expect(html.match(/class="toc-section-card transfer-list"/g)).toHaveLength(5)
    expect(html).not.toContain('<select multiple')
    expect(html).not.toContain('Ctrl or Command')
    for (const label of ['Supporting assessments', 'Supporting device usage', 'Supporting goals', 'Prior requests', 'Insurance']) {
      const group = html.slice(html.indexOf(`<legend>${label}</legend>`)).split('</fieldset>')[0]
      expect(group).toContain('Available (0)')
      expect(group).toContain('Selected (0)')
    }
  })
  it.each(ASSISTIVE_DEVICES)('displays submitted demo details for $display without editable name or UDI controls', (device) => {
    const form = { ...initialDeviceForm(), type: device.code }
    const input = deviceFormInputs(form, []).device
    const html = renderToStaticMarkup(<DeviceRequestForm value={form} options={[]} disabled={false} deviceLocked={false} onChange={() => {}} />)
    const details = html.slice(html.indexOf('<legend>Device</legend>'), html.indexOf('</fieldset>'))
    expect(details).toContain(`<dd>${input.deviceName![0].name}</dd>`)
    expect(details).toContain(`<dd>${input.deviceName![0].type}</dd>`)
    expect(details).toContain(`<dt>UDI device identifier</dt><dd>${input.udiCarrier![0].deviceIdentifier}</dd>`)
    expect(details).toContain(`<dt>UDI human-readable carrier</dt><dd>${input.udiCarrier![0].carrierHRF}</dd>`)
    expect(details).toContain('synthetic demonstration identifiers')
    expect(details).not.toContain('<input')
    expect(details).not.toContain('Add name')
    expect(details).not.toContain('Remove name')
    expect(details.match(/<select/g)).toHaveLength(2)
  })
  it('locks device selection while preserving demo details during request retry', () => {
    const html = renderToStaticMarkup(<DeviceRequestForm value={initialDeviceForm()} options={[]} disabled={false} deviceLocked={true} onChange={() => {}} />)
    expect(html).toContain('<fieldset disabled="" class="toc-section-card"><legend>Device</legend>')
    expect(html).toContain('Its fields are preserved for request retry.')
    expect(html).toContain('<dd>DEMO-PFE-58938008</dd>')
  })
})
