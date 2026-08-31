/** Loads an indexed TOC document and presents its metadata and clinical sections. */
import { useEffect, useState } from 'react'
import type { DocumentReference } from 'fhir/r4'
import { fetchBundleByReference, fetchDocumentReference, fetchPatient } from '../../lib/fhir/client'
import { getReferencedBundleUrl } from '../../lib/fhir/documentReferences'
import { formatDate, getCodeableConceptText, getDisplayNameFromHumanName, placeholderValue } from '../../lib/fhir/formatters'
import { navigateTo } from '../../lib/routing/routes'
import { useSavedServers } from '../servers/useSavedServers'
import { buildTocViewSections, type TocViewSection } from './tocModel'

type TocDetailPageProps = { patientId: string; documentReferenceId: string }

export function TocDetailPage({ patientId, documentReferenceId }: TocDetailPageProps) {
  const { activeServer } = useSavedServers()
  const [patientName, setPatientName] = useState('')
  const [documentReference, setDocumentReference] = useState<DocumentReference | null>(null)
  const [sections, setSections] = useState<TocViewSection[]>([])
  const [compositionTitle, setCompositionTitle] = useState('')
  const [compositionDate, setCompositionDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [warningMessage, setWarningMessage] = useState('')

  useEffect(() => {
    if (!activeServer) { navigateTo('/'); return }
    let mounted = true
    const baseUrl = activeServer.baseUrl
    async function load() {
      setIsLoading(true); setErrorMessage(''); setWarningMessage('')
      try {
        const [patient, document] = await Promise.all([fetchPatient(baseUrl, patientId), fetchDocumentReference(baseUrl, documentReferenceId)])
        if (!mounted) return
        setPatientName(getDisplayNameFromHumanName(patient.name?.[0]) || patient.id || placeholderValue())
        setDocumentReference(document)
        const bundleUrl = getReferencedBundleUrl(document, baseUrl)
        if (!bundleUrl) { setWarningMessage('This TOC DocumentReference does not contain a supported same-server Bundle URL.'); return }
        try {
          const bundle = await fetchBundleByReference(baseUrl, bundleUrl)
          if (!mounted) return
          const model = buildTocViewSections(bundle, baseUrl)
          if (!model) { setWarningMessage('The referenced Bundle did not contain a Composition.'); return }
          setSections(model.sections); setCompositionTitle(model.composition.title); setCompositionDate(model.composition.date)
        } catch (error) {
          if (mounted) setWarningMessage(error instanceof Error ? `Unable to load referenced Bundle. ${error.message}` : 'Unable to load referenced Bundle.')
        }
      } catch (error) { if (mounted) setErrorMessage(error instanceof Error ? error.message : 'Unable to load the TOC document.') }
      finally { if (mounted) setIsLoading(false) }
    }
    void load(); return () => { mounted = false }
  }, [activeServer, patientId, documentReferenceId])

  if (!activeServer) return null
  const title = compositionTitle || documentReference?.description || getCodeableConceptText(documentReference?.type) || 'Transition of Care'
  return <section className="panel">
    <div className="panel-header"><h2>Transition of Care</h2><div className="panel-server-details"><span className="panel-server-label">{activeServer.label}</span><span className="panel-server-url">{activeServer.baseUrl}</span></div></div>
    <div className="summary-preview-panel full-width-panel">
      <div className="page-actions page-actions-spaced"><button type="button" className="secondary-button outline" onClick={() => navigateTo(`/patients/${patientId}`)}>Back to patient</button></div>
      {isLoading ? <div className="info-banner">Loading Transition of Care document...</div> : null}{warningMessage ? <div className="warning-banner">{warningMessage}</div> : null}{errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
      {!isLoading && !errorMessage && documentReference ? <>
        <section className="patient-summary-hero"><div><p className="patient-summary-name">{title}</p><p className="patient-summary-meta">{patientName} · Date {formatDate(compositionDate || documentReference.date)} · DocumentReference/{documentReference.id}</p></div><span className="panel-tag">{documentReference.docStatus || documentReference.status}</span></section>
        <section className="summary-card wide toc-document-details"><h3>Document Details</h3><dl className="detail-grid"><div><dt>Type</dt><dd>{getCodeableConceptText(documentReference.type) || placeholderValue()}</dd></div><div><dt>Custodian</dt><dd>{documentReference.custodian?.display || documentReference.custodian?.reference || placeholderValue()}</dd></div><div><dt>Author</dt><dd>{documentReference.author?.map((author) => author.display || author.reference).filter(Boolean).join(', ') || placeholderValue()}</dd></div><div><dt>Identifier</dt><dd>{documentReference.masterIdentifier?.value || documentReference.identifier?.[0]?.value || placeholderValue()}</dd></div></dl></section>
        <div className="toc-view-grid">{sections.map((section, index) => <section key={`${section.title}-${index}`} className="summary-card toc-view-section"><h3>{section.title}</h3>{section.narrative ? <p className="toc-narrative">{section.narrative}</p> : null}{section.entries.length ? <ul className="clinical-list">{section.entries.map((entry) => <li key={entry.reference} className="clinical-list-item"><div className="clinical-list-main"><p className="clinical-item-title">{entry.title}</p>{entry.secondaryText ? <p className="clinical-item-secondary">{entry.secondaryText}</p> : null}</div><div className="clinical-item-meta"><span className="clinical-item-date-label">{entry.resource.resourceType}</span><span className="clinical-item-date-value">{entry.dateValue || '--'}</span></div></li>)}</ul> : <p className="empty-state">{section.emptyReason || 'No entries recorded'}</p>}</section>)}</div>
      </> : null}
    </div>
  </section>
}
