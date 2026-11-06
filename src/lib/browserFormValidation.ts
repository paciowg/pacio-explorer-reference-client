/** Reads browser constraints for controls explicitly associated with the shared validation fields. */
import type { FormIssue } from './formValidation'

export function getConstraintIssues(form: HTMLFormElement): FormIssue[] {
  const issues: FormIssue[] = []
  for (const control of Array.from(form.elements)) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || !control.willValidate || control.validity.valid) continue
    const field = control.closest<HTMLElement>('[data-validation-field]')?.dataset.validationField
    if (!field) continue
    const label = Array.from(control.labels?.[0]?.childNodes || []).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').trim() || 'This field'
    issues.push({ field, message: `${label}: ${control.validationMessage}` })
  }
  return issues
}

