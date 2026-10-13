/** Derives dated selection metadata from resource-specific clinical fields, falling back to explicitly labelled server updates. */
import type { ClaimResponse, Condition, Coverage, DeviceRequest, DeviceUseStatement, DiagnosticReport, DocumentReference, Goal, Observation, Resource } from 'fhir/r4'

export type ResourceTimestamp = { dateValue?: string; dateLabel?: string }

export function getResourceTimestamp(resource: Resource): ResourceTimestamp {
  let candidates: ResourceTimestamp[] = []
  switch (resource.resourceType) {
    case 'Observation': {
      const observation = resource as Observation
      candidates = [{ dateValue: observation.effectiveDateTime, dateLabel: 'Effective' },
        { dateValue: observation.effectivePeriod?.start, dateLabel: 'Effective' }, { dateValue: observation.issued, dateLabel: 'Issued' }]
      break
    }
    case 'DeviceUseStatement': {
      const use = resource as DeviceUseStatement
      candidates = [{ dateValue: use.recordedOn, dateLabel: 'Recorded' }, { dateValue: use.timingDateTime, dateLabel: 'Use date' },
        { dateValue: use.timingPeriod?.start, dateLabel: 'Use start' }]
      break
    }
    case 'Goal': {
      const goal = resource as Goal
      candidates = [{ dateValue: goal.statusDate, dateLabel: 'Status date' }, { dateValue: goal.startDate, dateLabel: 'Start date' }]
      break
    }
    case 'DeviceRequest': candidates = [{ dateValue: (resource as DeviceRequest).authoredOn, dateLabel: 'Authored' }]; break
    case 'Coverage': candidates = [{ dateValue: (resource as Coverage).period?.start, dateLabel: 'Coverage start' }]; break
    case 'ClaimResponse': candidates = [{ dateValue: (resource as ClaimResponse).created, dateLabel: 'Created' }]; break
    case 'Condition': {
      const condition = resource as Condition
      candidates = [{ dateValue: condition.recordedDate, dateLabel: 'Recorded' }, { dateValue: condition.onsetDateTime, dateLabel: 'Onset' },
        { dateValue: condition.onsetPeriod?.start, dateLabel: 'Onset' }]
      break
    }
    case 'DiagnosticReport': {
      const report = resource as DiagnosticReport
      candidates = [{ dateValue: report.effectiveDateTime, dateLabel: 'Effective' }, { dateValue: report.effectivePeriod?.start, dateLabel: 'Effective' },
        { dateValue: report.issued, dateLabel: 'Issued' }]
      break
    }
    case 'DocumentReference': candidates = [{ dateValue: (resource as DocumentReference).date, dateLabel: 'Document date' }]; break
  }
  candidates.push({ dateValue: resource.meta?.lastUpdated, dateLabel: 'Last updated' })
  return candidates.find((candidate) => candidate.dateValue && Number.isFinite(Date.parse(candidate.dateValue))) || {}
}
