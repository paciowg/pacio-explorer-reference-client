/** Collects independent form issues without coupling clinical validation to React or browser presentation. */
export type FormIssue = { field: string; message: string }

export function issueCollector() {
  const issues: FormIssue[] = []
  return {
    issues,
    require(field: string, valid: unknown, message: string) {
      if (!valid) issues.push({ field, message })
    },
    check(field: string, validate: () => unknown) {
      try { validate() } catch (error) {
        issues.push({ field, message: error instanceof Error ? error.message : 'Check this value.' })
      }
    },
  }
}
