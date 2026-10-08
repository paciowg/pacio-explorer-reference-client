/** Displays typed patient device disclosures and loads missing linked Devices only when expanded. */
import { useState } from 'react'
import type { Device } from 'fhir/r4'
import { ClinicalEntrySummary } from '../../components/ClinicalEntrySummary'
import { FhirResourceDetails } from '../../components/FhirResourceDetails'
import { readServerResource } from '../../lib/fhir/deviceTransport'
import { navigateTo } from '../../lib/routing/routes'
import { deviceEntryDetails, type DeviceEntry } from './deviceModel'

function DeviceRow({ entry, baseUrl }: { entry: DeviceEntry; baseUrl: string }) {
  const [device, setDevice] = useState<Device | undefined>(entry.device)
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'failed'>('idle')
  async function load(open: boolean) {
    if (!open || device || !entry.deviceReference || state !== 'idle') return
    setState('loading')
    try {
      const result = await readServerResource(baseUrl, entry.deviceReference)
      if (result.resourceType !== 'Device') throw new Error('Expected Device.')
      setDevice(result as Device)
      setState('loaded')
    } catch { setState('failed') }
  }
  return <li className="clinical-list-item clinical-list-expandable-item">
    <details className="clinical-entry-disclosure" onToggle={(event) => void load(event.currentTarget.open)}>
      <summary><ClinicalEntrySummary title={entry.title} resourceType={entry.resource.resourceType} secondaryText={'status' in entry.resource ? entry.resource.status : undefined} dateLabel={entry.dateValue ? 'Recorded' : undefined} dateValue={entry.dateValue} showDisclosure /></summary>
      <FhirResourceDetails model={deviceEntryDetails(entry, device)} />
      {state === 'loading' ? <p className="info-banner">Loading associated Device...</p> : null}
      {state === 'failed' ? <p className="warning-banner">Associated Device unavailable ({entry.deviceReference}).</p> : null}
    </details>
  </li>
}

export function DevicesSection({ entries, baseUrl, patientId, emptyMessage }: { entries: DeviceEntry[]; baseUrl: string; patientId: string; emptyMessage: string }) {
  return <section className="summary-card clinical-summary-card">
    <h3>Devices</h3>
    {entries.length ? <ul className="clinical-list">{entries.map((entry) => <DeviceRow key={`${baseUrl}:${patientId}:${entry.key}`} entry={entry} baseUrl={baseUrl} />)}</ul> : <p className="empty-state">{emptyMessage}</p>}
    <div className="clinical-section-footer"><button type="button" className="secondary-button outline compact" onClick={() => navigateTo(`/patients/${patientId}/device-requests/new`)}>Create Device Request</button></div>
  </section>
}
