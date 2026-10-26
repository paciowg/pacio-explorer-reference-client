/** Arranges patient document sections in display order while preserving each workflow's navigation and loading ownership. */
import { SelectableClinicalSummarySection } from '../../components/SelectableClinicalSummarySection'
import { navigateTo } from '../../lib/routing/routes'
import { SmpDocumentsSection } from '../medicationProfiles/SmpDocumentsSection'
import type { PatientSummaryModel } from './patientSummaryModel'

type DocumentsSummary = Pick<PatientSummaryModel, 'advanceDirectives' | 'transitionOfCares' | 'clinicalSectionEmptyMessage'>

export function PatientDocumentsView({ summary, baseUrl, patientId }: { summary: DocumentsSummary; baseUrl: string; patientId: string }) {
  return <>
    <SelectableClinicalSummarySection
      title="TOC Documents"
      items={summary.transitionOfCares}
      emptyMessage={summary.clinicalSectionEmptyMessage}
      onSelect={(item) => navigateTo(`/patients/${patientId}/transitions-of-care/${item.id}`)}
      footer={<div className="clinical-section-footer"><button type="button" className="secondary-button outline compact" onClick={() => navigateTo(`/patients/${patientId}/transitions-of-care/new`)}>Create TOC document</button></div>}
    />
    <SelectableClinicalSummarySection
      title="Advance Directives"
      items={summary.advanceDirectives}
      emptyMessage={summary.clinicalSectionEmptyMessage}
      onSelect={(item) => navigateTo(`/patients/${patientId}/advance-directives/${item.id}`)}
      footer={<div className="clinical-section-footer"><button type="button" className="secondary-button outline compact" onClick={() => navigateTo(`/patients/${patientId}/pmo`)}>Create ADI PMO</button></div>}
    />
    <SmpDocumentsSection baseUrl={baseUrl} patientId={patientId} />
  </>
}
