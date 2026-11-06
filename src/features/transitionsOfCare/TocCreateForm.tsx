/** Presents TOC metadata and required-section controls while leaving workflow state and submission to its page. */
import { SubmissionForm, SubmissionErrors, ValidationField } from '../../components/SubmissionForm'
import type { SubmitEvent } from 'react'
import type { FormIssue } from '../../lib/formValidation'
import { FhirResourceTypeBadge } from '../../components/FhirResourceTypeBadge'
import type { TocSectionKey, TocStatus } from '../../igs/pacioToc/tocDocument'
import type { OrganizationOption, PractitionerRoleOption } from '../../lib/fhir/resourceOptions'
import { DestinationServerField } from '../servers/DestinationServerField'
import type { SavedServer } from '../servers/serverStorage'
import type { TocSectionOptions } from './tocModel'

const EMPTY_REASONS = [
  { code: 'unavailable', label: 'No information available' },
  { code: 'nilknown', label: 'None known' },
  { code: 'notasked', label: 'Not asked' },
  { code: 'withheld', label: 'Information withheld' },
]

type TocCreateFormProps = {
  title: string
  status: TocStatus
  authorId: string
  custodianId: string
  authorOptions: PractitionerRoleOption[]
  custodianOptions: OrganizationOption[]
  sections: TocSectionOptions[]
  selected: Record<TocSectionKey, string[]>
  emptyReasons: Record<TocSectionKey, string>
  selectedCount: number
  destinationBaseUrl: string
  savedServers: SavedServer[]
  isSubmitting: boolean
  onTitleChange: (value: string) => void
  onStatusChange: (value: TocStatus) => void
  onAuthorChange: (value: string) => void
  onCustodianChange: (value: string) => void
  onDestinationServerChange: (baseUrl: string) => void
  onSectionSelectionChange: (key: TocSectionKey, references: string[]) => void
  onEmptyReasonChange: (key: TocSectionKey, reason: string) => void
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void | Promise<void>
  error?: string
  validate?: () => FormIssue[]
}

function TocMetadataFields(props: TocCreateFormProps) {
  return (
    <div className="toc-metadata-grid">
      <ValidationField field="toc-title" className="field-group">
        <label htmlFor="toc-title">Title</label>
        <input
          id="toc-title"
          value={props.title}
          onChange={(event) => props.onTitleChange(event.target.value)}
          disabled={props.isSubmitting}
        />
      </ValidationField>
      <ValidationField field="toc-status" className="field-group">
        <label htmlFor="toc-status">Document status</label>
        <select
          id="toc-status"
          value={props.status}
          onChange={(event) => props.onStatusChange(event.target.value as TocStatus)}
          disabled={props.isSubmitting}
        >
          <option value="preliminary">Preliminary</option>
          <option value="final">Final</option>
          <option value="amended">Amended</option>
        </select>
      </ValidationField>
      <ValidationField field="toc-author" className="field-group">
        <label htmlFor="toc-author">Author</label>
        <select
          id="toc-author"
          value={props.authorId}
          onChange={(event) => props.onAuthorChange(event.target.value)}
          disabled={props.isSubmitting}
        >
          <option value="">Select an author</option>
          {props.authorOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </ValidationField>
      <ValidationField field="toc-custodian" className="field-group">
        <label htmlFor="toc-custodian">Custodian</label>
        <select
          id="toc-custodian"
          value={props.custodianId}
          onChange={(event) => props.onCustodianChange(event.target.value)}
          disabled={props.isSubmitting}
        >
          <option value="">Select a custodian</option>
          {props.custodianOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </ValidationField>
    </div>
  )
}

type TocSectionCardProps = Pick<
  TocCreateFormProps,
  'isSubmitting' | 'onSectionSelectionChange' | 'onEmptyReasonChange'
> & {
  section: TocSectionOptions
  selectedReferences: string[]
  emptyReason: string
}

function TocSectionCard(props: TocSectionCardProps) {
  const { section, selectedReferences } = props
  return (
    <fieldset className="toc-section-card" disabled={props.isSubmitting}>
      <legend>{section.title}</legend>
      <div className="toc-section-actions">
        <span>{section.options.length} eligible</span>
        <button
          type="button"
          className="link-button"
          onClick={() => props.onSectionSelectionChange(
            section.key,
            section.options.map((option) => option.reference),
          )}
        >
          Select all
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => props.onSectionSelectionChange(section.key, [])}
        >
          Clear
        </button>
      </div>

      {section.options.length ? (
        <ul className="toc-option-list">
          {section.options.map((option) => (
            <li key={option.reference}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedReferences.includes(option.reference)}
                  onChange={(event) => props.onSectionSelectionChange(
                    section.key,
                    event.target.checked
                      ? [...selectedReferences, option.reference]
                      : selectedReferences.filter((reference) => reference !== option.reference),
                  )}
                />
                <span>
                  <span className="toc-option-title-row">
                    <FhirResourceTypeBadge resourceType={option.resource.resourceType} />
                    <strong>{option.title}</strong>
                  </span>
                  {option.secondaryText ? <small>{option.secondaryText}</small> : null}
                  {option.dateValue ? <small>{option.dateValue}</small> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">No eligible resources found</p>
      )}

      {selectedReferences.length === 0 ? (
        <ValidationField className="field-group toc-empty-reason">
          <label htmlFor={`empty-${section.key}`}>Empty reason</label>
          <select
            id={`empty-${section.key}`}
            value={props.emptyReason}
            onChange={(event) => props.onEmptyReasonChange(section.key, event.target.value)}
          >
            {EMPTY_REASONS.map((reason) => (
              <option key={reason.code} value={reason.code}>{reason.label}</option>
            ))}
          </select>
        </ValidationField>
      ) : null}
    </fieldset>
  )
}

export function TocCreateForm(props: TocCreateFormProps) {
  return (
    <SubmissionForm error={props.error} validate={props.validate} onSubmit={props.onSubmit}>
      <DestinationServerField
        id="toc-destination-server"
        servers={props.savedServers}
        value={props.destinationBaseUrl}
        disabled={props.isSubmitting}
        onChange={props.onDestinationServerChange}
      />
      <SubmissionErrors error={props.error} />
      <TocMetadataFields {...props} />
      <div className="toc-form-heading">
        <div>
          <h3>Required document sections</h3>
          <p className="helper-text">
            Selections start empty. Every section is included; empty sections record the reason
            you choose.
          </p>
        </div>
        <span className="panel-tag">{props.selectedCount} selected</span>
      </div>
      <ValidationField field="entries" className="toc-section-grid">
        {props.sections.map((section) => (
          <TocSectionCard
            key={section.key}
            section={section}
            selectedReferences={props.selected[section.key]}
            emptyReason={props.emptyReasons[section.key]}
            isSubmitting={props.isSubmitting}
            onSectionSelectionChange={props.onSectionSelectionChange}
            onEmptyReasonChange={props.onEmptyReasonChange}
          />
        ))}
      </ValidationField>
      <div className="form-actions toc-submit">
        <button type="submit" className="primary-button" disabled={props.isSubmitting}>
          {props.isSubmitting ? 'Creating TOC...' : 'Create TOC document'}
        </button>
      </div>
    </SubmissionForm>
  )
}
