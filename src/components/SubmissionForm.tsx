/** Shares submission feedback and page-top scrolling; feature forms retain ownership of validation rules and writes. */
import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState, type ComponentProps, type FieldsetHTMLAttributes, type ReactNode, type SubmitEvent } from 'react'
import type { FormIssue } from '../lib/formValidation'
import { getConstraintIssues } from '../lib/browserFormValidation'

const IssuesContext = createContext<FormIssue[]>([])
const ScopeContext = createContext('')

export function ValidationScope({ name, children }: { name: string; children: ReactNode }) {
  const parent = useContext(ScopeContext)
  return <ScopeContext value={`${parent}${name}.`}>{children}</ScopeContext>
}

/** Annotates existing controls without replacing their labels, helper descriptions, or focus behavior. */
export function ValidationField({ field, as = 'div', children, className = '', ...props }: {
  field?: string; as?: 'div' | 'fieldset'; children: ReactNode
} & FieldsetHTMLAttributes<HTMLElement>) {
  const scope = useContext(ScopeContext)
  const generatedId = useId()
  const key = `${scope}${field || generatedId}`
  const issues = useContext(IssuesContext).filter((issue) => issue.field === key)
  const ref = useRef<HTMLDivElement & HTMLFieldSetElement>(null)
  const errorId = `${generatedId}-error`
  const invalid = issues.length > 0
  useLayoutEffect(() => {
    if (!invalid || !ref.current) return
    const controls = Array.from(ref.current.querySelectorAll<HTMLElement>('input, select, textarea, [role="group"]'))
      .filter((control) => control.closest('[data-validation-field]') === ref.current)
    const restore = controls.map((control) => {
      const previousInvalid = control.getAttribute('aria-invalid')
      const previousDescription = control.getAttribute('aria-describedby')
      control.setAttribute('aria-invalid', 'true')
      control.setAttribute('aria-describedby', [previousDescription, errorId].filter(Boolean).join(' '))
      return () => {
        if (previousInvalid === null) control.removeAttribute('aria-invalid')
        else control.setAttribute('aria-invalid', previousInvalid)
        if (previousDescription === null) control.removeAttribute('aria-describedby')
        else control.setAttribute('aria-describedby', previousDescription)
      }
    })
    for (let parent = ref.current.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true
    }
    return () => restore.forEach((restoreControl) => restoreControl())
  })
  const Tag = as
  return <Tag {...props} ref={ref} data-validation-field={key} className={`${className}${invalid ? ' validation-field-invalid' : ''}`}
    aria-invalid={invalid || undefined} aria-describedby={[props['aria-describedby'], invalid ? errorId : ''].filter(Boolean).join(' ') || undefined}>
    {children}
    {invalid ? <div id={errorId} className="field-error">{issues.map((issue, index) => <p key={index}>{issue.message}</p>)}</div> : null}
  </Tag>
}

export function SubmissionErrors({ error = '' }: { error?: string }) {
  const issues = useContext(IssuesContext)
  if (!issues.length && !error) return null
  return <div className="error-banner" role="alert" data-submission-errors>
    {issues.length ? <ul>{issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul> : error}
  </div>
}

type Props = Omit<ComponentProps<'form'>, 'onSubmit'> & {
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void | Promise<void>
  validate?: () => FormIssue[]
  error?: string
  checkConstraints?: boolean
}

export function SubmissionForm({ onSubmit, validate, error = '', checkConstraints = true, children, ...props }: Props) {
  const ref = useRef<HTMLFormElement>(null)
  const attempted = useRef(false)
  const inFlight = useRef(false)
  const scrollPending = useRef(false)
  const [issues, setIssues] = useState<FormIssue[]>([])
  const [completion, setCompletion] = useState(0)
  const collect = useCallback(() => {
    const custom = validate?.() || []
    const fields = new Set(custom.map((issue) => issue.field))
    return [...custom, ...(checkConstraints && ref.current ? getConstraintIssues(ref.current) : []).filter((issue) => !fields.has(issue.field))]
  }, [validate, checkConstraints])

  // Recheck committed controlled values, including rows removed by button actions, without scrolling.
  useLayoutEffect(() => {
    if (!attempted.current || inFlight.current) return
    const next = collect()
    if (JSON.stringify(next) !== JSON.stringify(issues)) setIssues(next)
  }, [children, collect, issues])
  useLayoutEffect(() => {
    if (!scrollPending.current) return
    scrollPending.current = false
    if (issues.length || error) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [completion, error, issues.length])

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    attempted.current = true
    const next = collect()
    setIssues(next)
    if (!next.length) {
      inFlight.current = true
      try { await onSubmit(event) } finally { inFlight.current = false }
    }
    scrollPending.current = true
    setCompletion((value) => value + 1)
  }
  return <IssuesContext value={issues}><form {...props} ref={ref} noValidate onSubmit={(event) => { void submit(event) }} onReset={(event) => {
    attempted.current = false
    scrollPending.current = false
    setIssues([])
    props.onReset?.(event)
  }}>{children}</form></IssuesContext>
}
