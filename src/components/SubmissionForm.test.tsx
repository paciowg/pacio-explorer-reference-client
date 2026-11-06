/** Exercises shared submission feedback, scroll timing, and accessible field annotations without a browser or external writes. */
import type { ComponentProps, ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FormIssue } from '../lib/formValidation'

const harness = vi.hoisted(() => ({
  cursor: 0, cells: [] as unknown[], effects: [] as (() => void)[], scroll: vi.fn(),
  constraints: [] as FormIssue[], fieldIssues: [] as FormIssue[], scope: '',
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useId: () => 'field-id',
  useContext: (context: { _currentValue: unknown }) => typeof context._currentValue === 'string' ? harness.scope : harness.fieldIssues,
  useState: (initial: unknown) => {
    const index = harness.cursor++
    if (!(index in harness.cells)) harness.cells[index] = initial
    return [harness.cells[index], (next: unknown) => {
      harness.cells[index] = typeof next === 'function' ? next(harness.cells[index]) : next
    }]
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++
    if (!(index in harness.cells)) harness.cells[index] = { current: initial }
    return harness.cells[index]
  },
  useLayoutEffect: (effect: () => (() => void) | void, deps?: unknown[]) => {
    const index = harness.cursor++
    const previous = harness.cells[index] as { deps?: unknown[]; cleanup?: () => void } | undefined
    if (!previous || !deps || deps.some((dep, i) => dep !== previous.deps?.[i])) {
      const cell = { deps, cleanup: undefined as (() => void) | undefined }
      harness.cells[index] = cell
      harness.effects.push(() => { previous?.cleanup?.(); cell.cleanup = effect() || undefined })
    }
  },
}))
vi.mock('../lib/browserFormValidation', () => ({ getConstraintIssues: () => harness.constraints }))

import { SubmissionErrors, SubmissionForm, ValidationField } from './SubmissionForm'

type Props = ComponentProps<typeof SubmissionForm>
let props: Props
function render() {
  harness.cursor = 0
  const tree = SubmissionForm(props)
  const form = tree.props.children as ReactElement<ComponentProps<'form'>>
  ;(form.props.ref as { current: unknown }).current = {}
  return { tree, form }
}
function flush() {
  let result = render()
  for (let i = 0; i < 2; i++) {
    harness.effects.splice(0).forEach((effect) => effect())
    result = render()
  }
  return result
}
async function submit() {
  const { form } = render()
  form.props.onSubmit!({ preventDefault() {} } as Parameters<NonNullable<typeof form.props.onSubmit>>[0])
  await Promise.resolve()
  await Promise.resolve()
  return flush()
}

beforeEach(() => {
  harness.cursor = 0; harness.cells = []; harness.effects = []; harness.constraints = []; harness.fieldIssues = []; harness.scope = ''
  harness.scroll.mockReset()
  vi.stubGlobal('window', { scrollTo: harness.scroll })
  props = { onSubmit: vi.fn(), children: <SubmissionErrors /> }
  flush()
})
afterEach(() => vi.unstubAllGlobals())

describe('submission feedback', () => {
  it('collects custom and browser errors, prevents writes, and scrolls on every identical failed attempt', async () => {
    props.validate = () => [{ field: 'allergies', message: 'Choose allergy information.' }]
    harness.constraints = [{ field: 'date', message: 'Enter a date.' }, { field: 'allergies', message: 'Required.' }]
    flush()
    expect(harness.scroll).not.toHaveBeenCalled()
    const { tree, form } = await submit()
    expect(form.props.noValidate).toBe(true)
    expect(tree.props.value).toEqual([{ field: 'allergies', message: 'Choose allergy information.' }, { field: 'date', message: 'Enter a date.' }])
    expect(props.onSubmit).not.toHaveBeenCalled()
    expect(harness.scroll).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 0, behavior: 'instant' })
    await submit()
    expect(harness.scroll).toHaveBeenCalledTimes(2)
  })

  it('clears corrected and removed-row issues without scrolling while editing', async () => {
    let issues = [{ field: 'rows.1.amount', message: 'Enter a positive amount.' }]
    props.validate = () => issues
    await submit()
    issues = []
    expect(flush().tree.props.value).toEqual([])
    expect(harness.scroll).toHaveBeenCalledOnce()
    await submit()
    expect(props.onSubmit).toHaveBeenCalledOnce()
    expect(harness.scroll).toHaveBeenCalledOnce()
  })

  it('scrolls after asynchronous failure has rendered and allows identical deliberate retries', async () => {
    props.onSubmit = vi.fn(async () => { props = { ...props, error: 'Server rejected the submission.' } })
    await submit()
    expect(harness.scroll).toHaveBeenCalledOnce()
    await submit()
    expect(harness.scroll).toHaveBeenCalledTimes(2)
  })

  it('does not scroll for loading errors or successful submissions', async () => {
    props.error = 'Unable to load choices.'
    flush()
    expect(harness.scroll).not.toHaveBeenCalled()
    props.error = ''
    await submit()
    expect(props.onSubmit).toHaveBeenCalledOnce()
    expect(harness.scroll).not.toHaveBeenCalled()
  })

  it('blocks concurrent submissions until the original attempt finishes', async () => {
    let finish!: () => void
    props.onSubmit = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    await submit()
    await submit()
    expect(props.onSubmit).toHaveBeenCalledOnce()
    finish()
    await Promise.resolve()
    flush()
    await submit()
    expect(props.onSubmit).toHaveBeenCalledTimes(2)
    finish()
  })

  it('supports preserving unchanged imported fields without applying native required constraints', async () => {
    props.checkConstraints = false
    harness.constraints = [{ field: 'legacy-author', message: 'Required.' }]
    await submit()
    expect(props.onSubmit).toHaveBeenCalledOnce()
  })
})

describe('field feedback', () => {
  it('highlights the scoped row, associates its message, opens enclosing details, and restores helper descriptions on correction', () => {
    class Details { open = false; parentElement = null }
    vi.stubGlobal('HTMLDetailsElement', Details)
    harness.scope = 'rows.1.'
    harness.fieldIssues = [{ field: 'rows.1.amount', message: 'Enter a positive amount.' }]
    const details = new Details()
    const attributes = new Map([['aria-describedby', 'quantity-help']])
    const field = { parentElement: details, querySelectorAll: () => [control] }
    const control = {
      closest: () => field,
      getAttribute: (key: string) => attributes.get(key) ?? null,
      setAttribute: (key: string, value: string) => attributes.set(key, value),
      removeAttribute: (key: string) => attributes.delete(key),
    }
    const renderField = () => {
      harness.cursor = 0
      return ValidationField({ field: 'amount', children: <input /> })
    }
    const tree = renderField()
    ;(tree.props.ref as { current: unknown }).current = field
    harness.effects.splice(0).forEach((effect) => effect())
    expect(tree.props.className).toContain('validation-field-invalid')
    expect(attributes.get('aria-invalid')).toBe('true')
    expect(attributes.get('aria-describedby')).toBe('quantity-help field-id-error')
    expect(details.open).toBe(true)
    harness.fieldIssues = []
    const corrected = renderField()
    harness.effects.splice(0).forEach((effect) => effect())
    expect(corrected.props.className).not.toContain('validation-field-invalid')
    expect(attributes.get('aria-invalid')).toBeUndefined()
    expect(attributes.get('aria-describedby')).toBe('quantity-help')
  })
})
