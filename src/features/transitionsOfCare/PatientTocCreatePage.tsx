/** Coordinates review, validation, and submission of a PACIO TOC document. */
import { useEffect, useMemo, useState } from 'react'
import type { Bundle, Patient } from 'fhir/r4'
import { FhirResourceTypeBadge } from '../../components/FhirResourceTypeBadge'
import { TOC_SECTION_DEFINITIONS, type TocSectionKey, type TocStatus } from '../../igs/pacioToc/tocDocument'
import { fetchOrganizations, fetchPatient, fetchPatientEverything, fetchPractitionerRoles } from '../../lib/fhir/client'
import { getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { setRouteNotification } from '../../lib/routing/routeNotification'
import { getOrganizationOptions, getPractitionerMap, getPractitionerRoleOptions } from '../advanceDirectives/pmoFormModel'
import { useSavedServers } from '../servers/useSavedServers'
import { createTocDocument } from './createTocDocument'
import { buildTocSectionOptions } from './tocModel'

type PatientTocCreatePageProps = { patientId: string }
const EMPTY_REASONS = [
  { code: 'unavailable', label: 'No information available' },
  { code: 'nilknown', label: 'None known' },
  { code: 'notasked', label: 'Not asked' },
  { code: 'withheld', label: 'Information withheld' },
]

function emptySelections() {
  const selections = {} as Record<TocSectionKey, string[]>
  for (const section of TOC_SECTION_DEFINITIONS) selections[section.key] = []
  return selections
}

function defaultEmptyReasons() {
  return Object.fromEntries(TOC_SECTION_DEFINITIONS.map((section) => [section.key, 'unavailable'])) as Record<TocSectionKey, string>
}

export function PatientTocCreatePage({ patientId }: PatientTocCreatePageProps) {
  const { activeServer } = useSavedServers()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [patientBundle, setPatientBundle] = useState<Bundle | null>(null)
  const [authorOptions, setAuthorOptions] = useState<ReturnType<typeof getPractitionerRoleOptions>>([])
  const [custodianOptions, setCustodianOptions] = useState<ReturnType<typeof getOrganizationOptions>>([])
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<TocStatus>('final')
  const [authorId, setAuthorId] = useState('')
  const [custodianId, setCustodianId] = useState('')
  const [selected, setSelected] = useState(emptySelections)
  const [emptyReasons, setEmptyReasons] = useState(defaultEmptyReasons)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [warningMessage, setWarningMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!activeServer) { navigateTo('/'); return }
    let mounted = true
    const baseUrl = activeServer.baseUrl
    async function load() {
      setIsLoading(true); setErrorMessage(''); setWarningMessage('')
      try {
        const [loadedPatient, roleBundle, organizationBundle, everythingResult] = await Promise.all([
          fetchPatient(baseUrl, patientId), fetchPractitionerRoles(baseUrl, 200), fetchOrganizations(baseUrl, 200),
          fetchPatientEverything(baseUrl, patientId, { maxResults: 500, pageCount: 250 })
            .then((bundle) => ({ bundle, error: '' }))
            .catch(() => ({ bundle: null, error: '$everything was unavailable, so patient resources cannot be selected and TOC creation cannot be completed.' })),
        ])
        if (!mounted) return
        const practitionerMap = getPractitionerMap(roleBundle)
        const roles = getPractitionerRoleOptions(roleBundle, practitionerMap)
        const organizations = getOrganizationOptions(organizationBundle)
        const patientName = getDisplayNameFromHumanName(loadedPatient.name?.[0]) || loadedPatient.id || patientId
        setPatient(loadedPatient); setPatientBundle(everythingResult.bundle); setWarningMessage(everythingResult.error)
        setAuthorOptions(roles); setCustodianOptions(organizations)
        setAuthorId(roles[0]?.value || ''); setCustodianId(organizations[0]?.value || '')
        setTitle(`Transfer Summary for ${patientName}`)
      } catch (error) {
        if (mounted) setErrorMessage(error instanceof Error ? error.message : 'Unable to load TOC creation data.')
      } finally { if (mounted) setIsLoading(false) }
    }
    void load()
    return () => { mounted = false }
  }, [activeServer, patientId])

  const sections = useMemo(() => buildTocSectionOptions(patientBundle), [patientBundle])
  const selectedCount = Object.values(selected).reduce((count, values) => count + values.length, 0)

  function setSectionSelection(key: TocSectionKey, references: string[]) {
    setSelected((current) => ({ ...current, [key]: references }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeServer || !patient) return
    const author = authorOptions.find((option) => option.value === authorId)
    const custodian = custodianOptions.find((option) => option.value === custodianId)
    if (!title.trim()) { setErrorMessage('Please enter a document title.'); return }
    if (!author) { setErrorMessage('Please select an author.'); return }
    if (!custodian) { setErrorMessage('Please select a custodian.'); return }
    if (selectedCount === 0) { setErrorMessage('Select at least one clinical entry for the TOC document.'); return }
    setIsSubmitting(true); setErrorMessage('')
    try {
      await createTocDocument({
        baseUrl: activeServer.baseUrl, patient, title: title.trim(), status, createdAt: new Date().toISOString(),
        author: { reference: `PractitionerRole/${author.role.id}`, display: author.label },
        custodian: { reference: `Organization/${custodian.organization.id}`, display: custodian.label },
        sections: sections.map((section) => ({
          key: section.key, emptyReason: emptyReasons[section.key],
          entries: section.options.filter((option) => selected[section.key].includes(option.reference)).map((option) => option.resource),
        })),
      })
      setRouteNotification({ routeHref: getRouteHref(`/patients/${patientId}`), message: 'Transition of Care document created successfully.', tone: 'success' })
      navigateTo(`/patients/${patientId}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create the TOC document.')
    } finally { setIsSubmitting(false) }
  }

  if (!activeServer) return null
  return <section className="panel">
    <div className="panel-header"><h2>Create Transition of Care</h2><div className="panel-server-details"><span className="panel-server-label">{activeServer.label}</span><span className="panel-server-url">{activeServer.baseUrl}</span></div></div>
    <div className="pmo-form-panel full-width-panel">
      <div className="page-actions page-actions-spaced"><button type="button" className="secondary-button outline" onClick={() => navigateTo(`/patients/${patientId}`)}>Back to patient</button></div>
      {isLoading ? <div className="info-banner">Loading TOC creation form...</div> : null}
      {warningMessage ? <div className="warning-banner">{warningMessage}</div> : null}
      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
      {!isLoading && patient ? <form onSubmit={submit}>
        <div className="toc-metadata-grid">
          <div className="field-group"><label htmlFor="toc-title">Title</label><input id="toc-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={isSubmitting} /></div>
          <div className="field-group"><label htmlFor="toc-status">Document status</label><select id="toc-status" value={status} onChange={(event) => setStatus(event.target.value as TocStatus)} disabled={isSubmitting}><option value="preliminary">Preliminary</option><option value="final">Final</option><option value="amended">Amended</option></select></div>
          <div className="field-group"><label htmlFor="toc-author">Author</label><select id="toc-author" value={authorId} onChange={(event) => setAuthorId(event.target.value)} disabled={isSubmitting}><option value="">Select an author</option>{authorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className="field-group"><label htmlFor="toc-custodian">Custodian</label><select id="toc-custodian" value={custodianId} onChange={(event) => setCustodianId(event.target.value)} disabled={isSubmitting}><option value="">Select a custodian</option>{custodianOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        </div>
        <div className="toc-form-heading"><div><h3>Required document sections</h3><p className="helper-text">Selections start empty. Every section is included; empty sections record the reason you choose.</p></div><span className="panel-tag">{selectedCount} selected</span></div>
        <div className="toc-section-grid">{sections.map((section) => {
          const selectedReferences = selected[section.key]
          return <fieldset key={section.key} className="toc-section-card" disabled={isSubmitting}>
            <legend>{section.title}</legend>
            <div className="toc-section-actions"><span>{section.options.length} eligible</span><button type="button" className="link-button" onClick={() => setSectionSelection(section.key, section.options.map((option) => option.reference))}>Select all</button><button type="button" className="link-button" onClick={() => setSectionSelection(section.key, [])}>Clear</button></div>
            {section.options.length ? <ul className="toc-option-list">{section.options.map((option) => <li key={option.reference}><label><input type="checkbox" checked={selectedReferences.includes(option.reference)} onChange={(event) => setSectionSelection(section.key, event.target.checked ? [...selectedReferences, option.reference] : selectedReferences.filter((reference) => reference !== option.reference))} /><span><span className="toc-option-title-row"><strong>{option.title}</strong><FhirResourceTypeBadge resourceType={option.resource.resourceType} /></span>{option.secondaryText ? <small>{option.secondaryText}</small> : null}{option.dateValue ? <small>{option.dateValue}</small> : null}</span></label></li>)}</ul> : <p className="empty-state">No eligible resources found</p>}
            {selectedReferences.length === 0 ? <div className="field-group toc-empty-reason"><label htmlFor={`empty-${section.key}`}>Empty reason</label><select id={`empty-${section.key}`} value={emptyReasons[section.key]} onChange={(event) => setEmptyReasons((current) => ({ ...current, [section.key]: event.target.value }))}>{EMPTY_REASONS.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}</select></div> : null}
          </fieldset>
        })}</div>
        <div className="form-actions toc-submit"><button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Creating TOC...' : 'Create TOC document'}</button></div>
      </form> : null}
    </div>
  </section>
}
