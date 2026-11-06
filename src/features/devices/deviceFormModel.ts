/** Converts demo form values into typed PFE builder inputs while leaving profile rules in the IG layer. */
import { resolveOptionReference } from '../../lib/fhir/resourceOptions'
import type { DeviceRequest, TimingRepeat } from 'fhir/r4'
import { calendarDateValue, localDateInputValue } from '../../lib/dateTime'
import { ASSISTIVE_DEVICES, demoDeviceDefaults, DEVICE_PARAMETERS, DEVICE_REASON_CODES, DEVICE_REASON_REFERENCE_TYPES, RELATIONSHIP_SYSTEM, snomedConcept, type PFEDeviceRequestInput } from '../../igs/pacioPfe/deviceRequest'
import { type ReferenceOption } from './deviceCreateData'
import type { CreateDeviceRequestInput } from './createDeviceRequest'
import { issueCollector } from '../../lib/formValidation'

export type ParameterValue = { code: string; kind: 'quantity' | 'concept' | 'boolean' | 'range'; value: string; unit: string; high: string }
export type UserValue = { reference: string; relationship: string }
export type LocationValue = { kind: 'text' | 'coded'; value: string }
export type DeviceForm = {
  type: string; owner: string
  status: NonNullable<DeviceRequest['status']>; intent: DeviceRequest['intent']; priority: string
  encounter: string; authoredOn: string
  occurrence: '' | 'date' | 'period' | 'timing'; start: string; end: string
  frequency: string; period: string; periodUnit: NonNullable<TimingRepeat['periodUnit']>
  requester: string; priorRequests: string[]; insurance: string[]; notes: string[]
  parameters: ParameterValue[]; locations: LocationValue[]; users: UserValue[]
  justificationNotes: string[]; assessments: string[]; goals: string[]
  reasonCodes: string[]; reasonReferences: string[]
}

export function initialDeviceForm(): DeviceForm {
  return { type: ASSISTIVE_DEVICES[0].code, owner: '', status: 'draft', intent: 'order', priority: '',
    encounter: '', authoredOn: localDateInputValue(),
    occurrence: '', start: '', end: '', frequency: '1', period: '1', periodUnit: 'd',
    requester: '', priorRequests: [], insurance: [], notes: [], parameters: [], locations: [], users: [],
    justificationNotes: [], assessments: [], goals: [], reasonCodes: [], reasonReferences: [] }
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

export function validateDeviceForm(form: DeviceForm, options: ReferenceOption[]) {
  const v = issueCollector()
  v.require('Device type', ASSISTIVE_DEVICES.some((device) => device.code === form.type), 'Select a supported device type.')
  if (form.authoredOn) v.check('Authored date', () => calendarDateValue(form.authoredOn, 'authored date'))
  for (const [field, value] of [['Organization responsible for device', form.owner], ['Encounter', form.encounter], ['Requester', form.requester]]) {
    v.check(field, () => resolveOptionReference(options, value))
  }
  for (const [field, values] of [['Prior requests', form.priorRequests], ['Insurance', form.insurance], ['Supporting assessments', form.assessments], ['Supporting goals', form.goals], ['Reason references', form.reasonReferences]] as const) {
    values.forEach((value) => v.check(field, () => resolveOptionReference(options, value)))
  }
  form.users.forEach((user, index) => {
    const field = `users.${index}.User ${index + 1}`
    v.require(field, user.reference, 'Select a reference for each device user.')
    if (user.reference) v.check(field, () => resolveOptionReference(options, user.reference))
  })
  form.parameters.forEach((parameter, index) => {
    const key = `parameters.${index}.`
    v.require(`${key}Parameter ${index + 1}`, DEVICE_PARAMETERS.some((code) => code.code === parameter.code), 'Select a supported parameter code.')
    if (parameter.kind === 'concept') v.require(`${key}Value`, parameter.value.trim(), 'Enter a parameter value.')
    if (parameter.kind === 'quantity' || parameter.kind === 'range') v.check(`${key}${parameter.kind === 'range' ? 'Low value' : 'Value'}`, () => number(parameter.value))
    if (parameter.kind === 'range') {
      v.check(`${key}High value`, () => number(parameter.high))
      v.require(`${key}High value`, !parameter.value.trim() || !parameter.high.trim() || !(Number(parameter.high) < Number(parameter.value)), 'Parameter range end must not precede its start.')
    }
  })
  if (form.occurrence) {
    if (form.occurrence !== 'timing') v.require('Start date', form.start, 'Enter an occurrence start date.')
    v.require('End date', !form.start || !form.end || form.end >= form.start, 'Occurrence end must not precede its start.')
    if (form.occurrence === 'timing') {
      v.check('Times per period', () => {
        if (!Number.isInteger(positiveNumber(form.frequency, 'Frequency'))) throw new Error('Frequency must be a whole number.')
      })
      v.check('Period length', () => positiveNumber(form.period, 'Repeat period'))
    }
  }
  return v.issues
}

export function deviceFormInputs(form: DeviceForm, options: ReferenceOption[]): Pick<CreateDeviceRequestInput, 'device' | 'request'> {
  const selected = ASSISTIVE_DEVICES.find((device) => device.code === form.type)
  if (!selected) throw new Error('Select a supported device type.')
  if (form.users.some((user) => !user.reference)) throw new Error('Select a reference for each device user.')
  const refs = (values: string[], types?: readonly string[]) => values.filter(Boolean).map((value) =>
    resolveOptionReference(types ? options.filter((option) => types.includes(option.resource.resourceType)) : options, value)!)
  const strings = (values: string[]) => values.map((value) => value.trim()).filter(Boolean)
  const request: Omit<PFEDeviceRequestInput, 'subject' | 'device'> = {
    status: form.status, intent: form.intent,
    ...(form.priority ? { priority: form.priority as DeviceRequest['priority'] } : {}),
    encounter: resolveOptionReference(options, form.encounter), requester: resolveOptionReference(options, form.requester),
    ...(form.authoredOn ? { authoredOn: calendarDateValue(form.authoredOn, 'authored date') } : {}),
    priorRequest: refs(form.priorRequests), insurance: refs(form.insurance),
    reasonCode: form.reasonCodes.map((code) => {
      const reason = DEVICE_REASON_CODES.find((reason) => reason.code === code)
      if (!reason) throw new Error('Select a supported reason code.')
      return { coding: [{ ...reason }], text: reason.display }
    }),
    reasonReference: refs(form.reasonReferences, DEVICE_REASON_REFERENCE_TYPES),
    note: strings(form.notes).map((text) => ({ text })), locations: form.locations.filter((location) => location.value.trim()).map((location) =>
      location.kind === 'text' ? location.value.trim() : snomedConcept('42665001', 'Nursing home')),
    users: form.users.filter((user) => user.reference).map((user) => ({ user: resolveOptionReference(options, user.reference)!,
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
  const justification = { notes: strings(form.justificationNotes), assessments: refs(form.assessments), goals: refs(form.goals) }
  if (Object.values(justification).some((values) => values.length)) request.justifications = [justification]
  return { device: { type: snomedConcept(selected.code, selected.display), ...demoDeviceDefaults(selected),
    owner: resolveOptionReference(options, form.owner) }, request }
}
