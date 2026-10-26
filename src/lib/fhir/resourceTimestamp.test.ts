/** Verifies resource-specific selection dates and labelled metadata fallback without inventing missing timestamps. */
import { describe, expect, it } from 'vitest'
import { getResourceTimestamp } from './resourceTimestamp'

describe('resource selection timestamps', () => {
  it.each([
    [{ resourceType: 'Observation' as const, effectiveDateTime: '2026-10-13T09:30:00Z', issued: '2026-10-14T10:00:00Z' }, '2026-10-13T09:30:00Z', 'Effective'],
    [{ resourceType: 'Observation' as const, effectivePeriod: { start: '2026-10-12T08:00:00Z' } }, '2026-10-12T08:00:00Z', 'Effective'],
    [{ resourceType: 'DeviceUseStatement' as const, recordedOn: '2026-10-11', timingDateTime: '2026-10-10' }, '2026-10-11', 'Recorded'],
    [{ resourceType: 'Goal' as const, statusDate: '2026-10-09', startDate: '2026-10-01' }, '2026-10-09', 'Status date'],
    [{ resourceType: 'DeviceRequest' as const, authoredOn: '2026-10-08T12:00:00Z' }, '2026-10-08T12:00:00Z', 'Authored'],
    [{ resourceType: 'Coverage' as const, period: { start: '2026-01-01' } }, '2026-01-01', 'Coverage start'],
    [{ resourceType: 'ClaimResponse' as const, created: '2026-10-07' }, '2026-10-07', 'Created'],
    [{ resourceType: 'Condition' as const, recordedDate: '2026-10-06', onsetDateTime: '2026-09-01' }, '2026-10-06', 'Recorded'],
    [{ resourceType: 'DiagnosticReport' as const, effectivePeriod: { start: '2026-10-05' }, issued: '2026-10-06' }, '2026-10-05', 'Effective'],
    [{ resourceType: 'DocumentReference' as const, date: '2026-10-04T11:00:00Z' }, '2026-10-04T11:00:00Z', 'Document date'],
    [{ resourceType: 'List' as const, date: '2026-10-23' }, '2026-10-23', 'List date'],
    [{ resourceType: 'MedicationStatement' as const, dateAsserted: '2026-10-23', effectiveDateTime: '2026-10-01' }, '2026-10-23', 'Asserted'],
    [{ resourceType: 'MedicationStatement' as const, effectivePeriod: { start: '2026-10' } }, '2026-10', 'Effective start'],
  ])('uses the primary date for resource %#', (resource, dateValue, dateLabel) => {
    expect(getResourceTimestamp({ ...resource, meta: { lastUpdated: '2026-10-15T00:00:00Z' } })).toEqual({ dateValue, dateLabel })
  })

  it('skips invalid clinical dates and uses a valid issued or metadata date', () => {
    const resource = { resourceType: 'Observation', effectiveDateTime: 'invalid', issued: '2026-10-13T10:00:00Z', meta: { lastUpdated: '2026-10-14T10:00:00Z' } }
    expect(getResourceTimestamp(resource)).toEqual({ dateValue: resource.issued, dateLabel: 'Issued' })
    const withoutIssued = { ...resource, issued: undefined }
    expect(getResourceTimestamp(withoutIssued)).toEqual({ dateValue: resource.meta.lastUpdated, dateLabel: 'Last updated' })
    expect(getResourceTimestamp({ resourceType: 'Observation' })).toEqual({})
    expect(getResourceTimestamp({ resourceType: 'Observation', meta: { lastUpdated: 'invalid' } })).toEqual({})
  })
})
