/** Converts demo form values into typed PFE builder inputs while leaving profile rules in the IG layer. */
import type { DeviceRequest, TimingRepeat } from 'fhir/r4'
import { ASSISTIVE_DEVICES, demoDeviceDefaults, DEVICE_PARAMETERS, RELATIONSHIP_SYSTEM, snomedConcept, type PFEDeviceRequestInput } from '../../igs/pacioPfe/deviceRequest'
import { optionReference, type ReferenceOption } from './deviceCreateData'
import type { CreateDeviceRequestInput } from './createDeviceRequest'

export type ParameterValue = { code: string; kind: 'quantity' | 'concept' | 'boolean' | 'range'; value: string; unit: string; high: string }
export type UserValue = { reference: string; relationship: string }
export type LocationValue = { kind: 'text' | 'coded'; value: string }
export type DeviceForm = {
  type: string; owner: string
  status: NonNullable<DeviceRequest['status']>; intent: DeviceRequest['intent']; priority: string
  groupSystem: string; groupValue: string; encounter: string; authoredOn: string
  occurrence: '' | 'date' | 'period' | 'timing'; start: string; end: string
  frequency: string; period: string; periodUnit: NonNullable<TimingRepeat['periodUnit']>
  requester: string; priorRequests: string[]; insurance: string[]; notes: string[]
  parameters: ParameterValue[]; locations: LocationValue[]; users: UserValue[]
  justificationNotes: string[]; assessments: string[]; uses: string[]; goals: string[]
}

export function initialDeviceForm(): DeviceForm {
  return { type: ASSISTIVE_DEVICES[0].code, owner: '', status: 'draft', intent: 'order', priority: '',
    groupSystem: '', groupValue: '', encounter: '', authoredOn: new Date().toISOString().slice(0, 16),
    occurrence: '', start: '', end: '', frequency: '1', period: '1', periodUnit: 'd',
    requester: '', priorRequests: [], insurance: [], notes: [], parameters: [], locations: [], users: [],
    justificationNotes: [], assessments: [], uses: [], goals: [] }
}

function positiveNumber(value: string, label: string) {
  const number = Number(value)
  if (!value.trim() || !Number.isFinite(number) || number <= 0) throw new Error(`${label} must be a positive number.`)
  return number
}
function number(value: string) {
  if (!value.trim() || !Number.isFinite(Number(value))) throw new Error('Enter a numeric parameter value.')
  return Number(value)
}

export function deviceFormInputs(form: DeviceForm, options: ReferenceOption[]): Pick<CreateDeviceRequestInput, 'device' | 'request'> {
  const selected = ASSISTIVE_DEVICES.find((device) => device.code === form.type)
  if (!selected) throw new Error('Select a supported device type.')
  if (form.users.some((user) => !user.reference)) throw new Error('Select a reference for each device user.')
  if (form.groupSystem && !form.groupValue.trim()) throw new Error('Enter a group identifier value when specifying its system.')
  const refs = (values: string[]) => values.filter(Boolean).map((value) => optionReference(options, value)!)
  const strings = (values: string[]) => values.map((value) => value.trim()).filter(Boolean)
  const request: Omit<PFEDeviceRequestInput, 'subject' | 'device'> = {
    status: form.status, intent: form.intent,
    ...(form.priority ? { priority: form.priority as DeviceRequest['priority'] } : {}),
    ...(form.groupValue.trim() ? { groupIdentifier: { ...(form.groupSystem.trim() ? { system: form.groupSystem.trim() } : {}), value: form.groupValue.trim() } } : {}),
    encounter: optionReference(options, form.encounter), requester: optionReference(options, form.requester),
    ...(form.authoredOn ? { authoredOn: new Date(`${form.authoredOn}Z`).toISOString() } : {}),
    priorRequest: refs(form.priorRequests), insurance: refs(form.insurance),
    note: strings(form.notes).map((text) => ({ text })), locations: form.locations.filter((location) => location.value.trim()).map((location) =>
      location.kind === 'text' ? location.value.trim() : snomedConcept('42665001', 'Nursing home')),
    users: form.users.filter((user) => user.reference).map((user) => ({ user: optionReference(options, user.reference)!,
      ...(user.relationship ? { relationships: [{ coding: [{ system: RELATIONSHIP_SYSTEM, code: user.relationship, display: user.relationship }] }] } : {}) })),
    parameter: form.parameters.map((parameter) => {
      const code = DEVICE_PARAMETERS.find((code) => code.code === parameter.code)
      if (!code) throw new Error('Select a supported parameter code.')
      if (parameter.kind === 'concept' && !parameter.value.trim()) throw new Error('Enter a parameter value.')
      const quantity = (value: string) => ({ value: number(value), ...(parameter.unit.trim() ? { unit: parameter.unit.trim() } : {}) })
      if (parameter.kind === 'range' && number(parameter.high) < number(parameter.value)) throw new Error('Parameter range end must not precede its start.')
      return { code: snomedConcept(code.code, code.display),
        ...(parameter.kind === 'quantity' ? { valueQuantity: quantity(parameter.value) } :
          parameter.kind === 'range' ? { valueRange: { low: quantity(parameter.value), high: quantity(parameter.high) } } :
          parameter.kind === 'boolean' ? { valueBoolean: parameter.value === 'true' } : { valueCodeableConcept: { text: parameter.value.trim() } }) }
    }),
  }
  if (form.occurrence) {
    if (form.occurrence !== 'timing' && !form.start) throw new Error('Enter an occurrence start date.')
    if (form.start && form.end && form.end < form.start) throw new Error('Occurrence end must not precede its start.')
    const period = { ...(form.start ? { start: form.start } : {}), ...(form.end ? { end: form.end } : {}) }
    if (form.occurrence === 'date') request.occurrenceDateTime = form.start
    if (form.occurrence === 'period') request.occurrencePeriod = period
    if (form.occurrence === 'timing') {
      const frequency = positiveNumber(form.frequency, 'Frequency')
      if (!Number.isInteger(frequency)) throw new Error('Frequency must be a whole number.')
      request.occurrenceTiming = { repeat: { frequency, period: positiveNumber(form.period, 'Repeat period'), periodUnit: form.periodUnit,
        ...(form.start || form.end ? { boundsPeriod: period } : {}) } }
    }
  }
  const justification = { notes: strings(form.justificationNotes), assessments: refs(form.assessments), uses: refs(form.uses), goals: refs(form.goals) }
  if (Object.values(justification).some((values) => values.length)) request.justifications = [justification]
  return { device: { type: snomedConcept(selected.code, selected.display), ...demoDeviceDefaults(selected),
    owner: optionReference(options, form.owner) }, request }
}
