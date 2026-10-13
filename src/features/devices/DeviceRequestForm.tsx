/** Presents a small, repeatable PFE creation form using destination-local reference choices and existing form styling. */
import type { DeviceForm, ParameterValue, UserValue } from './deviceFormModel'
import type { ReferenceOption } from './deviceCreateData'
import { ASSISTIVE_DEVICES, demoDeviceDefaults, DEVICE_PARAMETERS, DEVICE_REASON_CODES, DEVICE_REASON_REFERENCE_TYPES } from '../../igs/pacioPfe/deviceRequest'
import { getResourceReferenceChoices, getResourceTransferChoices } from '../../lib/fhir/resourceOptions'
import { TransferList } from '../../components/TransferList'

type Props = { value: DeviceForm; options: ReferenceOption[]; disabled: boolean; deviceLocked: boolean; onChange: (value: DeviceForm) => void }

function TextField({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <div className="field-group"><label>{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} /></label></div>
}

function Choice({ label, value, onChange, choices, optional = true }: { label: string; value: string; onChange: (value: string) => void; choices: Array<{ value: string; label: string }>; optional?: boolean }) {
  return <div className="field-group"><label>{label}<select value={value} onChange={(event) => onChange(event.target.value)} required={!optional}>
    {optional ? <option value="">None selected</option> : null}{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
  </select></label></div>
}
const codes = (values: readonly string[]) => values.map((value) => ({ value, label: value.replaceAll('-', ' ') }))

function RepeatedText({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  return <fieldset className="toc-section-card"><legend>{label}</legend>{values.map((value, index) => <div className="device-repeat-row" key={index}>
    <TextField label={`${label} ${index + 1}`} value={value} onChange={(value) => onChange(values.map((old, position) => position === index ? value : old))} />
    <button type="button" className="secondary-button compact" onClick={() => onChange(values.filter((_, position) => position !== index))}>Remove</button>
  </div>)}<button type="button" className="secondary-button compact" onClick={() => onChange([...values, ''])}>Add {label.toLowerCase()}</button></fieldset>
}

export function DeviceRequestForm({ value: form, options, disabled, deviceLocked, onChange }: Props) {
  const selected = ASSISTIVE_DEVICES.find((device) => device.code === form.type)
  const defaults = selected ? demoDeviceDefaults(selected) : undefined
  const set = <K extends keyof DeviceForm>(key: K, value: DeviceForm[K]) => onChange({ ...form, [key]: value })
  const choices = (types: string[]) => getResourceReferenceChoices(options, types)
  const reference = (label: string, key: 'owner' | 'encounter' | 'requester', types: string[]) => <Choice label={label} value={form[key]} onChange={(value) => set(key, value)} choices={choices(types)} />
  const references = (label: string, key: 'priorRequests' | 'insurance' | 'assessments' | 'uses' | 'goals' | 'reasonReferences', types: string[]) =>
    <TransferList label={label} options={getResourceTransferChoices(options, types)} values={form[key]} showDates disabled={disabled} onChange={(values) => set(key, values)} />
  const updateParameter = (index: number, patch: Partial<ParameterValue>) => set('parameters', form.parameters.map((value, position) => position === index ? { ...value, ...patch } : value))
  const updateUser = (index: number, patch: Partial<UserValue>) => set('users', form.users.map((value, position) => position === index ? { ...value, ...patch } : value))
  return <fieldset disabled={disabled} className="device-form-fields">
    <fieldset disabled={deviceLocked} className="toc-section-card"><legend>Device</legend>
      {deviceLocked ? <p className="helper-text">The Device has been created. Its fields are preserved for request retry.</p> : null}
      <Choice label="Device type" value={form.type} optional={false} choices={ASSISTIVE_DEVICES.map((device) => ({ value: device.code, label: device.display }))} onChange={(type) => set('type', type)} />
      {defaults ? <dl className="fhir-detail-grid">
        <div><dt>Device name</dt><dd>{defaults.deviceName[0].name}</dd></div>
        <div><dt>Name type</dt><dd>{defaults.deviceName[0].type}</dd></div>
        <div><dt>UDI device identifier</dt><dd>{defaults.udiCarrier[0].deviceIdentifier}</dd></div>
        <div><dt>UDI human-readable carrier</dt><dd>{defaults.udiCarrier[0].carrierHRF}</dd></div>
      </dl> : null}
      <p className="helper-text">Device details are set automatically. UDI values are synthetic demonstration identifiers shared by device type.</p>
      {reference('Organization responsible for device', 'owner', ['Organization'])}
      <p className="helper-text">The Device and request will be associated with this patient on the destination.</p>
    </fieldset>
    <fieldset className="toc-section-card"><legend>Request</legend><div className="toc-metadata-grid">
      <Choice label="Status" value={form.status} optional={false} choices={codes(['draft', 'active', 'on-hold', 'revoked', 'completed', 'entered-in-error', 'unknown'])} onChange={(value) => set('status', value as DeviceForm['status'])} />
      <Choice label="Intent" value={form.intent} optional={false} choices={codes(['proposal', 'plan', 'directive', 'order', 'original-order', 'reflex-order', 'filler-order', 'instance-order', 'option'])} onChange={(value) => set('intent', value as DeviceForm['intent'])} />
      <Choice label="Priority" value={form.priority} choices={codes(['routine', 'urgent', 'asap', 'stat'])} onChange={(value) => set('priority', value)} />
      <TextField label="Authored date and time (UTC)" type="datetime-local" value={form.authoredOn} onChange={(value) => set('authoredOn', value)} />
      {reference('Encounter', 'encounter', ['Encounter'])}
      {/* The IG supports Device requesters, but this specialized use case is omitted from the demo. */}
      {reference('Requester', 'requester', ['PractitionerRole', 'Practitioner', 'Organization'])}
    </div></fieldset>
    <details><summary>Scheduling and device parameters</summary><div className="device-form-fields">
      <fieldset className="toc-section-card"><legend>Occurrence</legend>
        <Choice label="Schedule representation" value={form.occurrence} choices={[{ value: 'date', label: 'Date' }, { value: 'period', label: 'Date range' }, { value: 'timing', label: 'Repeating schedule' }]} onChange={(value) => set('occurrence', value as DeviceForm['occurrence'])} />
        {form.occurrence ? <TextField label="Start date" type="date" value={form.start} onChange={(value) => set('start', value)} /> : null}
        {form.occurrence === 'period' || form.occurrence === 'timing' ? <TextField label="End date" type="date" value={form.end} onChange={(value) => set('end', value)} /> : null}
        {form.occurrence === 'timing' ? <div className="toc-metadata-grid"><TextField label="Times per period" type="number" value={form.frequency} onChange={(value) => set('frequency', value)} /><TextField label="Period length" type="number" value={form.period} onChange={(value) => set('period', value)} /><Choice label="Period unit" value={form.periodUnit} optional={false} choices={codes(['h', 'd', 'wk', 'mo'])} onChange={(value) => set('periodUnit', value as DeviceForm['periodUnit'])} /></div> : null}
      </fieldset>
      <fieldset className="toc-section-card"><legend>Parameters</legend>{form.parameters.map((parameter, index) => <div className="device-repeat-row" key={index}>
        <Choice label={`Parameter ${index + 1}`} optional={false} value={parameter.code} choices={DEVICE_PARAMETERS.map((code) => ({ value: code.code, label: code.display }))} onChange={(code) => updateParameter(index, { code })} />
        <Choice label="Value type" optional={false} value={parameter.kind} choices={codes(['quantity', 'concept', 'boolean', 'range'])} onChange={(kind) => updateParameter(index, { kind: kind as ParameterValue['kind'], value: kind === 'boolean' ? 'true' : '' })} />
        {parameter.kind === 'boolean' ? <Choice label="Value" optional={false} value={parameter.value} choices={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} onChange={(value) => updateParameter(index, { value })} /> : <TextField label={parameter.kind === 'range' ? 'Low value' : 'Value'} value={parameter.value} required onChange={(value) => updateParameter(index, { value })} />}
        {parameter.kind === 'range' ? <TextField label="High value" value={parameter.high} required onChange={(high) => updateParameter(index, { high })} /> : null}
        {parameter.kind === 'range' || parameter.kind === 'quantity' ? <TextField label="Unit" value={parameter.unit} onChange={(unit) => updateParameter(index, { unit })} /> : null}
        <button type="button" className="secondary-button compact" onClick={() => set('parameters', form.parameters.filter((_, position) => position !== index))}>Remove parameter</button>
      </div>)}<button type="button" className="secondary-button compact" onClick={() => set('parameters', [...form.parameters, { code: DEVICE_PARAMETERS[0].code, kind: 'quantity', value: '', unit: '', high: '' }])}>Add parameter</button></fieldset>
    </div></details>
    <details><summary>Reasons for this request</summary><div className="device-form-fields">
      <p className="helper-text">Optional: select coded reasons, supporting records, or both. These selections complement clinical justification.</p>
      <TransferList label="Coded reasons" options={DEVICE_REASON_CODES.map((reason) => ({ value: reason.code, label: reason.display }))}
        values={form.reasonCodes} disabled={disabled} onChange={(values) => set('reasonCodes', values)} />
      {references('Reason references', 'reasonReferences', [...DEVICE_REASON_REFERENCE_TYPES])}
    </div></details>
    <details><summary>PFE users, locations, and clinical justification</summary><div className="device-form-fields">
      <fieldset className="toc-section-card"><legend>Preferred locations</legend>{form.locations.map((location, index) => <div className="device-repeat-row" key={index}>
        <Choice label={`Location ${index + 1} representation`} value={location.kind} optional={false} choices={[{ value: 'text', label: 'Free text' }, { value: 'coded', label: 'Coded location' }]} onChange={(kind) => set('locations', form.locations.map((old, position) => position === index ? { kind: kind as 'text' | 'coded', value: kind === 'coded' ? '42665001' : '' } : old))} />
        {location.kind === 'text' ? <TextField label="Preferred location" value={location.value} onChange={(value) => set('locations', form.locations.map((old, position) => position === index ? { ...old, value } : old))} /> : <Choice label="Location" value={location.value} optional={false} choices={[{ value: '42665001', label: 'Nursing home' }]} onChange={(value) => set('locations', form.locations.map((old, position) => position === index ? { ...old, value } : old))} />}
        <button type="button" className="secondary-button compact" onClick={() => set('locations', form.locations.filter((_, position) => position !== index))}>Remove location</button>
      </div>)}<button type="button" className="secondary-button compact" onClick={() => set('locations', [...form.locations, { kind: 'text', value: '' }])}>Add location</button></fieldset>
      <fieldset className="toc-section-card"><legend>Device users</legend>{form.users.map((user, index) => <div className="device-repeat-row" key={index}>
        <Choice label={`User ${index + 1}`} value={user.reference} optional={false} choices={choices(['Patient', 'RelatedPerson', 'Practitioner', 'PractitionerRole', 'CareTeam'])} onChange={(reference) => updateUser(index, { reference })} />
        <Choice label="Relationship to device" value={user.relationship} choices={codes(['patient', 'operator', 'custodian', 'maintainer'])} onChange={(relationship) => updateUser(index, { relationship })} />
        <button type="button" className="secondary-button compact" onClick={() => set('users', form.users.filter((_, position) => position !== index))}>Remove user</button>
      </div>)}<button type="button" className="secondary-button compact" onClick={() => set('users', [...form.users, { reference: choices(['Patient'])[0]?.value || '', relationship: 'patient' }])}>Add user</button></fieldset>
      <RepeatedText label="Justification notes" values={form.justificationNotes} onChange={(value) => set('justificationNotes', value)} />
      {references('Supporting assessments', 'assessments', ['Observation'])}{references('Supporting device usage', 'uses', ['DeviceUseStatement'])}{references('Supporting goals', 'goals', ['Goal'])}
    </div></details>
    <details><summary>Prior requests, insurance, and notes</summary><div className="device-form-fields">
      {references('Prior requests', 'priorRequests', ['DeviceRequest'])}{references('Insurance', 'insurance', ['Coverage', 'ClaimResponse'])}
      <RepeatedText label="Request notes" values={form.notes} onChange={(value) => set('notes', value)} />
    </div></details>
  </fieldset>
}
