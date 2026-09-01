/** Coordinates review, validation, and submission of a PACIO TOC document. */
import { useEffect, useMemo, useState } from 'react'
import type { Bundle, Patient } from 'fhir/r4'
import { TOC_SECTION_DEFINITIONS, type TocSectionKey, type TocStatus } from '../../igs/pacioToc/tocDocument'
import { fetchOrganizations, fetchPatient, fetchPatientEverything, fetchPractitionerRoles } from '../../lib/fhir/client'
import { getDisplayNameFromHumanName } from '../../lib/fhir/formatters'
import { getOrganizationOptions, getPractitionerMap, getPractitionerRoleOptions } from '../../lib/fhir/resourceOptions'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { setRouteNotification } from '../../lib/routing/routeNotification'
import { useSavedServers } from '../servers/useSavedServers'
import { createTocDocument } from './createTocDocument'
import { TocCreateForm } from './TocCreateForm'
import { buildTocSectionOptions } from './tocModel'

type PatientTocCreatePageProps = { patientId: string }

function emptySelections() {
  const selections = {} as Record<TocSectionKey, string[]>
  for (const section of TOC_SECTION_DEFINITIONS) selections[section.key] = []
  return selections
}

function defaultEmptyReasons() {
  return Object.fromEntries(TOC_SECTION_DEFINITIONS.map((section) => [section.key, 'unavailable'])) as Record<TocSectionKey, string>
}

async function loadTocCreateData(baseUrl: string, patientId: string) {
  const [patient, roleBundle, organizationBundle, everythingResult] = await Promise.all([
    fetchPatient(baseUrl, patientId),
    fetchPractitionerRoles(baseUrl, 200),
    fetchOrganizations(baseUrl, 200),
    fetchPatientEverything(baseUrl, patientId, { maxResults: 500, pageCount: 250 })
      .then((bundle) => ({ bundle, warning: '' }))
      .catch(() => ({
        bundle: null,
        warning: '$everything was unavailable, so patient resources cannot be selected and TOC creation cannot be completed.',
      })),
  ])
  const practitionerMap = getPractitionerMap(roleBundle)
  return {
    patient,
    patientBundle: everythingResult.bundle,
    warning: everythingResult.warning,
    authorOptions: getPractitionerRoleOptions(roleBundle, practitionerMap),
    custodianOptions: getOrganizationOptions(organizationBundle),
  }
}

export function PatientTocCreatePage({ patientId }: PatientTocCreatePageProps) {
  const { activeServer, savedServers } = useSavedServers()
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
  const [destinationBaseUrl, setDestinationBaseUrl] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [warningMessage, setWarningMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (activeServer) setDestinationBaseUrl(activeServer.baseUrl)
  }, [activeServer])

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
        const loaded = await loadTocCreateData(baseUrl, patientId)
        if (!mounted) return

        const patientName = getDisplayNameFromHumanName(loaded.patient.name?.[0]) ||
          loaded.patient.id ||
          patientId
        setPatient(loaded.patient)
        setPatientBundle(loaded.patientBundle)
        setWarningMessage(loaded.warning)
        setAuthorOptions(loaded.authorOptions)
        setCustodianOptions(loaded.custodianOptions)
        setAuthorId(loaded.authorOptions[0]?.value || '')
        setCustodianId(loaded.custodianOptions[0]?.value || '')
        setTitle(`Transfer Summary for ${patientName}`)
      } catch (error) {
        if (mounted) setErrorMessage(error instanceof Error ? error.message : 'Unable to load TOC creation data.')
      } finally {
        if (mounted) setIsLoading(false)
      }
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
    const destinationServer = savedServers.find(
      (server) => server.baseUrl === destinationBaseUrl,
    )
    if (!destinationServer) {
      setErrorMessage('Please select a destination FHIR server.')
      return
    }
    const author = authorOptions.find((option) => option.value === authorId)
    const custodian = custodianOptions.find((option) => option.value === custodianId)
    if (!title.trim()) {
      setErrorMessage('Please enter a document title.')
      return
    }
    if (!author) {
      setErrorMessage('Please select an author.')
      return
    }
    if (!custodian) {
      setErrorMessage('Please select a custodian.')
      return
    }
    if (selectedCount === 0) {
      setErrorMessage('Select at least one clinical entry for the TOC document.')
      return
    }
    setIsSubmitting(true)
    setErrorMessage('')
    try {
      await createTocDocument({
        sourceBaseUrl: activeServer.baseUrl,
        destinationBaseUrl: destinationServer.baseUrl,
        patient,
        title: title.trim(),
        status,
        createdAt: new Date().toISOString(),
        author: { reference: `PractitionerRole/${author.role.id}`, display: author.label },
        custodian: { reference: `Organization/${custodian.organization.id}`, display: custodian.label },
        sections: sections.map((section) => ({
          key: section.key,
          emptyReason: emptyReasons[section.key],
          entries: section.options
            .filter((option) => selected[section.key].includes(option.reference))
            .map((option) => option.resource),
        })),
      })
      setRouteNotification({
        routeHref: getRouteHref(`/patients/${patientId}`),
        message: `Transition of Care document created successfully on ${destinationServer.label}.`,
        tone: 'success',
      })
      navigateTo(`/patients/${patientId}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create the TOC document.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!activeServer) return null
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Create Transition of Care</h2>
        <div className="panel-server-details">
          <span className="section-kicker">Source FHIR server</span>
          <span className="panel-server-label">{activeServer.label}</span>
          <span className="panel-server-url">{activeServer.baseUrl}</span>
        </div>
      </div>
      <div className="pmo-form-panel full-width-panel">
        <div className="page-actions page-actions-spaced">
          <button
            type="button"
            className="secondary-button outline"
            onClick={() => navigateTo(`/patients/${patientId}`)}
          >
            Back to patient
          </button>
        </div>
        {isLoading ? <div className="info-banner">Loading TOC creation form...</div> : null}
        {warningMessage ? <div className="warning-banner">{warningMessage}</div> : null}
        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
        {!isLoading && patient ? (
          <TocCreateForm
            title={title}
            status={status}
            authorId={authorId}
            custodianId={custodianId}
            authorOptions={authorOptions}
            custodianOptions={custodianOptions}
            sections={sections}
            selected={selected}
            emptyReasons={emptyReasons}
            selectedCount={selectedCount}
            destinationBaseUrl={destinationBaseUrl}
            savedServers={savedServers}
            isSubmitting={isSubmitting}
            onTitleChange={setTitle}
            onStatusChange={setStatus}
            onAuthorChange={setAuthorId}
            onCustodianChange={setCustodianId}
            onDestinationServerChange={setDestinationBaseUrl}
            onSectionSelectionChange={setSectionSelection}
            onEmptyReasonChange={(key, reason) => setEmptyReasons((current) => ({
              ...current,
              [key]: reason,
            }))}
            onSubmit={submit}
          />
        ) : null}
      </div>
    </section>
  )
}
