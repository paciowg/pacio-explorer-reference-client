/** Renders loaded TOC metadata, section summaries, and expandable resource details without owning transport state. */
import type { DocumentReference } from 'fhir/r4'
import { ExpandableFhirResource } from '../../components/FhirResourceDetails'
import { formatDate, getCodeableConceptText, placeholderValue } from '../../lib/fhir/formatters'
import type { TocViewSection } from './tocModel'

type TocDocumentViewProps = {
  title: string
  patientName: string
  compositionDate: string
  documentReference: DocumentReference
  sections: TocViewSection[]
}

function TocDocumentDetails({ documentReference }: Pick<TocDocumentViewProps, 'documentReference'>) {
  return (
    <section className="summary-card wide toc-document-details">
      <h3>Document Details</h3>
      <dl className="detail-grid">
        <div>
          <dt>Type</dt>
          <dd>{getCodeableConceptText(documentReference.type) || placeholderValue()}</dd>
        </div>
        <div>
          <dt>Custodian</dt>
          <dd>
            {documentReference.custodian?.display ||
              documentReference.custodian?.reference ||
              placeholderValue()}
          </dd>
        </div>
        <div>
          <dt>Author</dt>
          <dd>
            {documentReference.author
              ?.map((author) => author.display || author.reference)
              .filter(Boolean)
              .join(', ') || placeholderValue()}
          </dd>
        </div>
        <div>
          <dt>Identifier</dt>
          <dd>
            {documentReference.masterIdentifier?.value ||
              documentReference.identifier?.[0]?.value ||
              placeholderValue()}
          </dd>
        </div>
      </dl>
    </section>
  )
}

function TocSectionView({ section }: { section: TocViewSection }) {
  return (
    <section className="summary-card toc-view-section">
      <h3>{section.title}</h3>
      <p className="toc-narrative">{section.summary}</p>
      {section.entries.length ? (
        <ul className="clinical-list">
          {section.entries.map((entry) => (
            <ExpandableFhirResource
              key={entry.reference}
              title={entry.title}
              resource={entry.resource}
              details={entry.details ?? null}
              secondaryText={entry.secondaryText}
              dateLabel="Date"
              dateValue={entry.dateValue}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

export function TocDocumentView(props: TocDocumentViewProps) {
  const { documentReference } = props
  return (
    <>
      <section className="patient-summary-hero">
        <div>
          <p className="patient-summary-name">{props.title}</p>
          <p className="patient-summary-meta">
            {props.patientName} · Date {formatDate(props.compositionDate || documentReference.date)} ·{' '}
            DocumentReference/{documentReference.id}
          </p>
        </div>
        <span className="panel-tag">{documentReference.docStatus || documentReference.status}</span>
      </section>
      <TocDocumentDetails documentReference={documentReference} />
      <div className="toc-view-grid">
        {props.sections.map((section, index) => (
          <TocSectionView key={`${section.title}-${index}`} section={section} />
        ))}
      </div>
    </>
  )
}
