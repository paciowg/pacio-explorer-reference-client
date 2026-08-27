import { useEffect, useMemo, useState } from 'react'
import type { DocumentReference } from 'fhir/r4'
import {
  fetchBundleByReference,
  fetchDocumentReference,
  fetchPatient,
} from '../../lib/fhir/client'
import {
  formatDate,
  getCodeableConceptText,
  getDisplayNameFromHumanName,
  placeholderValue,
} from '../../lib/fhir/formatters'
import { navigateTo } from '../../lib/routing/routes'
import { useSavedServers } from '../servers/useSavedServers'
import {
  buildBundleDerivedData,
  buildDocumentDetailsRows,
  getBundleLoadWarning,
  getReferencedBundleUrl,
  MISSING_COMPOSITION_WARNING,
  type BundleDerivedData,
} from './advanceDirectiveModel'

type AdvanceDirectiveDetailPageProps = {
  patientId: string
  documentReferenceId: string
}

export function AdvanceDirectiveDetailPage({
  patientId,
  documentReferenceId,
}: AdvanceDirectiveDetailPageProps) {
  const { activeServer } = useSavedServers()
  const [patientName, setPatientName] = useState('')
  const [documentReference, setDocumentReference] = useState<DocumentReference | null>(null)
  const [bundleDerivedData, setBundleDerivedData] = useState<BundleDerivedData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [bundleWarningMessage, setBundleWarningMessage] = useState('')

  useEffect(() => {
    if (!activeServer) {
      navigateTo('/')
      return
    }

    const baseUrl = activeServer.baseUrl
    let isMounted = true
    setIsLoading(true)
    setErrorMessage('')
    setBundleWarningMessage('')
    setBundleDerivedData(null)

    async function load() {
      try {
        const [patient, loadedDocumentReference] = await Promise.all([
          fetchPatient(baseUrl, patientId),
          fetchDocumentReference(baseUrl, documentReferenceId),
        ])
        if (!isMounted) return

        setPatientName(
          getDisplayNameFromHumanName(patient.name?.[0]) || patient.id || placeholderValue(),
        )
        setDocumentReference(loadedDocumentReference)

        const bundleReference = getReferencedBundleUrl(loadedDocumentReference, baseUrl)
        if (!bundleReference) return

        try {
          const bundle = await fetchBundleByReference(baseUrl, bundleReference)
          if (!isMounted) return
          const derivedData = buildBundleDerivedData(bundle, baseUrl)
          if (derivedData) {
            setBundleDerivedData(derivedData)
          } else {
            setBundleWarningMessage(MISSING_COMPOSITION_WARNING)
          }
        } catch (bundleError) {
          if (!isMounted) return
          setBundleWarningMessage(getBundleLoadWarning(bundleError))
        }
      } catch (error) {
        if (!isMounted) return
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load the advance directive.',
        )
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void load()
    return () => { isMounted = false }
  }, [activeServer, patientId, documentReferenceId])

  const documentDetailsRows = useMemo(
    () => documentReference
      ? buildDocumentDetailsRows(documentReference, bundleDerivedData?.composition)
      : [],
    [documentReference, bundleDerivedData],
  )

  if (!activeServer) return null

  const pageTitle = bundleDerivedData?.composition.title ||
    getCodeableConceptText(bundleDerivedData?.composition.type) ||
    getCodeableConceptText(documentReference?.type) ||
    'Advance Directive'
  const pageDate = bundleDerivedData?.composition.date || documentReference?.date

  return (
    <section className="panel">
      <div className="panel-header">
        <div><h2>Advance Directive</h2></div>
        <div className="panel-server-details">
          <span className="panel-server-label">{activeServer.label}</span>
          <span className="panel-server-url">{activeServer.baseUrl}</span>
        </div>
      </div>

      <div className="summary-preview-panel full-width-panel">
        <div className="page-actions page-actions-spaced">
          <button
            type="button"
            className="secondary-button outline"
            onClick={() => navigateTo(`/patients/${patientId}`)}
          >
            Back to patient
          </button>
        </div>

        {isLoading ? <div className="info-banner">Loading advance directive...</div> : null}
        {bundleWarningMessage ? <div className="warning-banner">{bundleWarningMessage}</div> : null}
        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

        {!isLoading && !errorMessage && documentReference ? (
          <>
            <section className="patient-summary-hero">
              <div>
                <p className="patient-summary-name">{pageTitle}</p>
                <p className="patient-summary-meta">
                  {patientName} · Date {formatDate(pageDate)} · DocumentReference/{documentReference.id}
                </p>
              </div>
            </section>

            {bundleDerivedData?.pdfViewers.length ? (
              <section className="summary-card wide source-attachments-section">
                <h3>Source Attachments</h3>
                <div className="attachment-actions">
                  {bundleDerivedData.pdfViewers.map((viewer) => (
                    <button
                      key={viewer.label}
                      type="button"
                      className="secondary-button outline"
                      onClick={viewer.open}
                    >
                      {viewer.label}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="summary-card wide">
              <h3>Document Details</h3>
              <dl className="stacked-details detail-list">
                {documentDetailsRows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd className="preformatted-detail">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </>
        ) : null}
      </div>
    </section>
  )
}
