/** Verifies native constraints map to the intended field without copying option text into validation messages. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConstraintIssues } from './browserFormValidation'

class Control {
  willValidate = true
  validity = { valid: false }
  validationMessage = 'Please fill out this field.'
  labels = [{ childNodes: [{ nodeType: 3, textContent: 'Order date' }, { nodeType: 1, textContent: 'All option labels' }] }]
  field: string | undefined = 'order-date'
  closest() { return this.field ? { dataset: { validationField: this.field } } : null }
}
const form = (...elements: unknown[]) => ({ elements }) as unknown as HTMLFormElement

beforeEach(() => {
  vi.stubGlobal('HTMLInputElement', Control)
  vi.stubGlobal('HTMLSelectElement', Control)
  vi.stubGlobal('HTMLTextAreaElement', Control)
  vi.stubGlobal('Node', { TEXT_NODE: 3 })
})
afterEach(() => vi.unstubAllGlobals())

describe('browser constraint collection', () => {
  it('uses explicit group keys and only the text portion of a wrapping label', () => {
    const control = new Control()
    control.field = 'supplements.1.schedules.0.Start date'
    expect(getConstraintIssues(form(control))).toEqual([{ field: control.field, message: 'Order date: Please fill out this field.' }])
  })
  it('skips valid, disabled, non-control, and unregistered elements', () => {
    const valid = new Control(); valid.validity.valid = true
    const disabled = new Control(); disabled.willValidate = false
    const unregistered = new Control(); unregistered.field = undefined
    expect(getConstraintIssues(form(valid, disabled, unregistered, {}))).toEqual([])
  })
})
