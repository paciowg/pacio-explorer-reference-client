/** Presents a saved snapshot through the existing document and medication viewers without loading live clinical resources. */
import type { List } from 'fhir/r4'
import { FhirJsonLink } from '../../components/FhirJsonLink'
import { formatDate, getCodeableConceptText, getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import { savedDocumentResolver, type SavedDocument } from '../../lib/fhir/savedDocuments'
import { buildBundleDerivedData, buildDocumentDetailsRows } from '../advanceDirectives/advanceDirectiveModel'
import { SmpListContent } from '../medicationProfiles/SmpListContent'
import { TocDocumentView } from '../transitionsOfCare/TocDocumentView'
import { buildTocViewSections } from '../transitionsOfCare/tocModel'
import { documentKindLabels, type DocumentKind } from './sendDocument'

export function SavedDocumentPreview({ data, kind, sourceBase }: { data: SavedDocument; kind: DocumentKind; sourceBase: string }) {
  const { bundle, documentReference, patient } = data
  const patientName = getDisplayNameFromHumanName(patient.name?.[0])
  const toc = kind === 'toc' ? buildTocViewSections(bundle, sourceBase) : null
  const adi = kind === 'adi' ? buildBundleDerivedData(bundle, sourceBase) : null
  const rows = buildDocumentDetailsRows(documentReference, adi?.composition)
  const title = adi?.composition.title || documentReference.description || getCodeableConceptText(documentReference.type) || documentKindLabels[kind]
  return <>
    {toc ? <TocDocumentView title={toc.composition.title || title} patientName={patientName} compositionDate={toc.composition.date} documentReference={documentReference} sections={toc.sections} /> : <>
      <section className="patient-summary-hero"><div>
        <p className="patient-summary-name">{title}</p>
        <p className="patient-summary-meta">{patientName} · Date {formatDate(adi?.composition.date || documentReference.date)}</p>
      </div></section>
      {adi?.pdfViewers.length ? <section className="summary-card wide source-attachments-section">
        <h3>Source Attachments</h3><div className="attachment-actions">
          {adi.pdfViewers.map((viewer) => <button key={viewer.label} type="button" className="secondary-button outline" onClick={viewer.open}>{viewer.label}</button>)}
        </div>
      </section> : null}
      <section className="summary-card wide"><h3>{kind === 'smp' ? 'Collection Details' : 'Document Details'}</h3>
        <dl className="stacked-details detail-list">{rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd className="preformatted-detail">{row.value}</dd></div>)}</dl>
      </section>
      {kind === 'smp' ? <div className="smp-page">{bundle.entry?.flatMap((entry, i) => entry.resource?.resourceType === 'List' ? [
        <SmpListContent key={i} list={entry.resource as List} resolve={savedDocumentResolver(bundle, sourceBase)} showListJson={false} />,
      ] : [])}</div> : null}
    </>}
    <div className="page-actions">
      <div>DocumentReference: <FhirJsonLink resource={documentReference} baseUrl={sourceBase} /></div>
      <div>Bundle: <FhirJsonLink resource={bundle} baseUrl={sourceBase} /></div>
    </div>
  </>
}
