/** Presents a small, repeatable PFE creation form using destination-local reference choices and existing form styling. */
import type { DeviceForm, ParameterValue, UserValue } from './deviceFormModel'
import type { ReferenceOption } from './deviceCreateData'
import { ASSISTIVE_DEVICES, DEVICE_PARAMETERS } from '../../igs/pacioPfe/deviceRequest'

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
  const set = <K extends keyof DeviceForm>(key: K, value: DeviceForm[K]) => onChange({ ...form, [key]: value })
  const choices = (types: string[]) => options.filter((option) => types.includes(option.resource.resourceType)).map((option) => ({ value: option.reference, label: option.label }))
  const reference = (label: string, key: 'owner' | 'encounter' | 'requester', types: string[]) => <Choice label={label} value={form[key]} onChange={(value) => set(key, value)} choices={choices(types)} />
  const references = (label: string, key: 'priorRequests' | 'insurance' | 'assessments' | 'uses' | 'goals', types: string[]) => <fieldset className="toc-section-card"><legend>{label}</legend>
    <div className="field-group"><label>{label}<select multiple aria-label={label} value={form[key]} onChange={(event) => set(key, Array.from(event.target.selectedOptions, (option) => option.value))}>{choices(types).map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label></div>
    <small>Select multiple entries with Ctrl or Command. Leave unselected to omit.</small>
  </fieldset>
  const updateParameter = (index: number, patch: Partial<ParameterValue>) => set('parameters', form.parameters.map((value, position) => position === index ? { ...value, ...patch } : value))
  const updateUser = (index: number, patch: Partial<UserValue>) => set('users', form.users.map((value, position) => position === index ? { ...value, ...patch } : value))
  return <fieldset disabled={disabled} className="device-form-fields">
    <fieldset disabled={deviceLocked} className="toc-section-card"><legend>Device</legend>
      {deviceLocked ? <p className="helper-text">The Device has been created. Its fields are preserved for request retry.</p> : null}
      <Choice label="Device type" value={form.type} optional={false} choices={ASSISTIVE_DEVICES.map((device) => ({ value: device.code, label: device.display }))} onChange={(type) => {
        const device = ASSISTIVE_DEVICES.find((device) => device.code === type)!
        onChange({ ...form, type, names: form.names.map((name, index) => index === 0 ? { ...name, name: device.name } : name) })
      }} />
      {form.names.map((name, index) => <div className="device-repeat-row" key={index}>
        <TextField label={`Device name ${index + 1}`} value={name.name} required onChange={(value) => set('names', form.names.map((old, position) => position === index ? { ...old, name: value } : old))} />
        <Choice label="Name type" value={name.type} optional={false} choices={codes(['udi-label-name', 'user-friendly-name', 'patient-reported-name', 'manufacturer-name', 'model-name', 'other'])} onChange={(type) => set('names', form.names.map((old, position) => position === index ? { ...old, type: type as typeof old.type } : old))} />
        <button type="button" className="secondary-button compact" onClick={() => set('names', form.names.filter((_, position) => position !== index))}>Remove name</button>
      </div>)}
      <button type="button" className="secondary-button compact" onClick={() => set('names', [...form.names, { name: '', type: 'user-friendly-name' }])}>Add name</button>
      <div className="toc-metadata-grid"><TextField label="UDI device identifier" value={form.udiIdentifier} onChange={(value) => set('udiIdentifier', value)} /><TextField label="UDI human-readable carrier" value={form.udiHrf} onChange={(value) => set('udiHrf', value)} /></div>
      {reference('Organization responsible for device', 'owner', ['Organization'])}
      <p className="helper-text">The Device and request will be associated with this patient on the destination.</p>
    </fieldset>
    <fieldset className="toc-section-card"><legend>Request</legend><div className="toc-metadata-grid">
      <Choice label="Status" value={form.status} optional={false} choices={codes(['draft', 'active', 'on-hold', 'revoked', 'completed', 'entered-in-error', 'unknown'])} onChange={(value) => set('status', value as DeviceForm['status'])} />
      <Choice label="Intent" value={form.intent} optional={false} choices={codes(['proposal', 'plan', 'directive', 'order', 'original-order', 'reflex-order', 'filler-order', 'instance-order', 'option'])} onChange={(value) => set('intent', value as DeviceForm['intent'])} />
      <Choice label="Priority" value={form.priority} choices={codes(['routine', 'urgent', 'asap', 'stat'])} onChange={(value) => set('priority', value)} />
      <TextField label="Authored date and time (UTC)" type="datetime-local" value={form.authoredOn} onChange={(value) => set('authoredOn', value)} />
      <TextField label="Group identifier system" type="url" value={form.groupSystem} onChange={(value) => set('groupSystem', value)} />
      <TextField label="Group identifier value" value={form.groupValue} onChange={(value) => set('groupValue', value)} />
      {reference('Encounter', 'encounter', ['Encounter'])}{reference('Requester', 'requester', ['PractitionerRole', 'Practitioner', 'Organization', 'Device'])}
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
