/** Loads an indexed TOC document and presents its metadata and clinical sections. */
import { useEffect, useState } from 'react'
import type { DocumentReference } from 'fhir/r4'
import { loadDocumentDetails } from '../../lib/fhir/documentDetails'
import { getCodeableConceptText, getDisplayNameFromHumanName, placeholderValue } from '../../lib/fhir/formatters'
import { navigateTo } from '../../lib/routing/routes'
import { useSavedServers } from '../servers/useSavedServers'
import { TocDocumentView } from './TocDocumentView'
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
    if (!activeServer) {
      navigateTo('/')
      return
    }
    let mounted = true
    const baseUrl = activeServer.baseUrl

    async function load() {
      setIsLoading(true)
      setErrorMessage('')
      setWarningMessage('')
      try {
        const loaded = await loadDocumentDetails(baseUrl, patientId, documentReferenceId)
        if (!mounted) return
        setPatientName(
          getDisplayNameFromHumanName(loaded.patient.name?.[0]) ||
            loaded.patient.id ||
            placeholderValue(),
        )
        setDocumentReference(loaded.documentReference)

        if (!loaded.bundleReference) {
          setWarningMessage(
            'This TOC DocumentReference does not contain a supported same-server Bundle URL.',
          )
          return
        }
        if (!loaded.bundle) {
          setWarningMessage(
            loaded.bundleError instanceof Error
              ? `Unable to load referenced Bundle. ${loaded.bundleError.message}`
              : 'Unable to load referenced Bundle.',
          )
          return
        }

        const model = buildTocViewSections(loaded.bundle, baseUrl)
        if (!model) {
          setWarningMessage('The referenced Bundle did not contain a Composition.')
          return
        }
        setSections(model.sections)
        setCompositionTitle(model.composition.title)
        setCompositionDate(model.composition.date)
      } catch (error) {
        if (mounted) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Unable to load the TOC document.',
          )
        }
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void load()
    return () => { mounted = false }
  }, [activeServer, patientId, documentReferenceId])

  if (!activeServer) return null
  const title = compositionTitle ||
    documentReference?.description ||
    getCodeableConceptText(documentReference?.type) ||
    'Transition of Care'

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Transition of Care</h2>
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
        {isLoading ? (
          <div className="info-banner">Loading Transition of Care document...</div>
        ) : null}
        {warningMessage ? <div className="warning-banner">{warningMessage}</div> : null}
        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
        {!isLoading && !errorMessage && documentReference ? (
          <TocDocumentView
            title={title}
            patientName={patientName}
            compositionDate={compositionDate}
            documentReference={documentReference}
            sections={sections}
          />
        ) : null}
      </div>
    </section>
  )
}
