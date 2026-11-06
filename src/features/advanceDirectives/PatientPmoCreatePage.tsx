/** Coordinates the PMO form, supporting-resource lookup, validation, and ADI document submission. */
import { SubmissionForm, SubmissionErrors, ValidationField } from '../../components/SubmissionForm'
import { issueCollector } from '../../lib/formValidation'
import { PatientFormHeader } from '../../components/PatientFormHeader'
import { useEffect, useMemo, useState } from 'react'
import type {
  Patient,
  Practitioner,
  Reference,
  RelatedPerson,
} from 'fhir/r4'
import {
  fetchOrganizations,
  fetchPatient,
  fetchPractitionerRoles,
  fetchRelatedPersons,
} from '../../lib/fhir/client'
import {
  getDisplayNameFromHumanName,
  getPractitionerRoleDisplayName,
} from '../../lib/fhir/formatters'
import {
  getOrganizationOptions,
  getPractitionerChoices,
  type OrganizationOption,
  type PractitionerRoleOption,
} from '../../lib/fhir/resourceOptions'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { useSavedServers } from '../servers/useSavedServers'
import { DestinationServerField } from '../servers/DestinationServerField'
import { setRouteNotification } from '../../lib/routing/routeNotification'
import { readFileAsBase64 } from './browserFiles'
import { createPmoDocument } from './createPmoDocument'
import { calendarDateValue, localDateInputValue as formatDateInput } from '../../lib/dateTime'
import {
  addOneYearToDateValue as calculateContextPeriodEnd,
  getAttesterOptions,
  getAuthenticatorOptions,
  getDataEntererOptions,
  getFacilitatorOptions,
  getPatientJurisdiction as calculatePatientJurisdiction,
  getPmoSubmissionError,
  getRelatedPersons,
} from './pmoFormModel'

type PatientPmoCreatePageProps = {
  patientId: string
}

type PmoStatus = 'preliminary' | 'final' | 'amended'

export function PatientPmoCreatePage({ patientId }: PatientPmoCreatePageProps) {
  const { activeServer, savedServers } = useSavedServers()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [practitionerRoles, setPractitionerRoles] = useState<PractitionerRoleOption[]>([])
  const [practitionerByReference, setPractitionerByReference] = useState<
    Map<string, Practitioner>
  >(new Map())
  const [unpairedPractitioners, setUnpairedPractitioners] = useState<Map<string, Practitioner>>(new Map())
  const [relatedPersons, setRelatedPersons] = useState<RelatedPerson[]>([])
  const [custodianOptions, setCustodianOptions] = useState<OrganizationOption[]>([])
  const [custodianReference, setCustodianReference] = useState('')
  const [status, setStatus] = useState<PmoStatus>('final')
  const [authorRoleId, setAuthorRoleId] = useState('')
  const [attesterReference, setAttesterReference] = useState('')
  const [authenticatorReference, setAuthenticatorReference] = useState('')
  const [facilitatorReference, setFacilitatorReference] = useState('')
  const [dataEntererReference, setDataEntererReference] = useState('')
  const [signedDate, setSignedDate] = useState(formatDateInput(new Date()))
  const [contextPeriodEnd, setContextPeriodEnd] = useState(
    calculateContextPeriodEnd(formatDateInput(new Date())),
  )
  const [hasEditedContextPeriodEnd, setHasEditedContextPeriodEnd] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [destinationBaseUrl, setDestinationBaseUrl] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (activeServer) setDestinationBaseUrl(activeServer.baseUrl)
  }, [activeServer])

  useEffect(() => {
    if (!hasEditedContextPeriodEnd) {
      setContextPeriodEnd(calculateContextPeriodEnd(signedDate))
    }
  }, [signedDate, hasEditedContextPeriodEnd])

  useEffect(() => {
    if (!activeServer) {
      navigateTo('/')
      return
    }

    const baseUrl = activeServer.baseUrl

    let isMounted = true
    setIsLoading(true)
    setErrorMessage('')

    async function load() {
      try {
        // Load every resource class that can supply a participant or custodian reference.
        const [
          patientResult,
          practitionerRoleBundle,
          organizationBundle,
          relatedPersonBundle,
        ] = await Promise.all([
          fetchPatient(baseUrl, patientId),
          fetchPractitionerRoles(baseUrl, 200),
          fetchOrganizations(baseUrl, 200),
          fetchRelatedPersons(baseUrl, patientId, 200),
        ])

        if (!isMounted) return

        const { practitionerByReference: practitionerMap, roleOptions, unpairedPractitioners } = getPractitionerChoices(practitionerRoleBundle, baseUrl)
        const organizations = getOrganizationOptions(organizationBundle)
        const relatedPersonOptions = getRelatedPersons(relatedPersonBundle)

        setPatient(patientResult)
        setPractitionerByReference(practitionerMap)
        setUnpairedPractitioners(unpairedPractitioners)
        setPractitionerRoles(roleOptions)
        setRelatedPersons(relatedPersonOptions)
        setCustodianOptions(organizations)
        setAuthorRoleId((current) => current || roleOptions[0]?.value || '')
        setCustodianReference((current) =>
          current ||
          (organizations[0]?.organization.id
            ? `Organization/${organizations[0].organization.id}`
            : ''),
        )
      } catch (error) {
        if (!isMounted) return
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load PMO creation data.',
        )
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      isMounted = false
    }
  }, [activeServer, patientId])

  const attesterOptions = useMemo(
    () => getAttesterOptions(patient, practitionerRoles, relatedPersons),
    [patient, practitionerRoles, relatedPersons],
  )

  const authenticatorOptions = useMemo(
    () => getAuthenticatorOptions(practitionerRoles),
    [practitionerRoles],
  )

  const facilitatorOptions = useMemo(
    () => getFacilitatorOptions(practitionerRoles),
    [practitionerRoles],
  )

  const dataEntererOptions = useMemo(
    () =>
      getDataEntererOptions(
        patient,
        practitionerRoles,
        unpairedPractitioners,
        relatedPersons,
      ),
    [patient, practitionerRoles, unpairedPractitioners, relatedPersons],
  )

  useEffect(() => {
    if (!attesterReference && attesterOptions.length > 0) {
      setAttesterReference((current) => current || attesterOptions[0].reference)
    }
  }, [attesterOptions, attesterReference])

  useEffect(() => {
    if (!authenticatorReference && authenticatorOptions.length > 0) {
      setAuthenticatorReference((current) => current || authenticatorOptions[0].value)
    }
  }, [authenticatorOptions, authenticatorReference])

  useEffect(() => {
    if (!facilitatorReference && facilitatorOptions.length > 0) {
      setFacilitatorReference((current) => current || facilitatorOptions[0].value)
    }
  }, [facilitatorOptions, facilitatorReference])

  useEffect(() => {
    if (!dataEntererReference && dataEntererOptions.length > 0) {
      setDataEntererReference((current) => current || dataEntererOptions[0].reference)
    }
  }, [dataEntererOptions, dataEntererReference])

  function validateForm() {
    const v = issueCollector()
    v.require('pmo-destination-server', savedServers.some((server) => server.baseUrl === destinationBaseUrl), 'Please select a destination FHIR server.')
    v.require('pmo-author', practitionerRoles.some((option) => option.value === authorRoleId), 'Please select an author.')
    v.require('pmo-attester', attesterOptions.some((option) => option.reference === attesterReference), 'Please select an attester.')
    v.require('pmo-authenticator', authenticatorOptions.some((option) => option.value === authenticatorReference), 'Please select an authenticator.')
    v.require('pmo-pdf', pdfFile, 'Please upload a PDF source form.')
    v.check('pmo-signed-date', () => calendarDateValue(signedDate, 'signing date'))
    v.check('pmo-context-period-end', () => calendarDateValue(contextPeriodEnd, 'relevant-through date'))
    return v.issues
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!activeServer || !patient) return

    const destinationServer = savedServers.find(
      (server) => server.baseUrl === destinationBaseUrl,
    )
    if (!destinationServer) {
      setErrorMessage('Please select a destination FHIR server.')
      return
    }

    const authorRole = practitionerRoles.find((option) => option.value === authorRoleId)?.role
    const attester = attesterOptions.find((option) => option.reference === attesterReference)
    const authenticator = authenticatorOptions.find(
      (option) => option.value === authenticatorReference,
    )?.reference
    const facilitator = facilitatorOptions.find(
      (option) => option.value === facilitatorReference,
    )?.reference
    const dataEnterer = dataEntererOptions.find(
      (option) => option.reference === dataEntererReference,
    )
    const jurisdiction = calculatePatientJurisdiction(patient)
    const custodian = custodianReference
      ? ({
          reference: custodianReference,
          display:
            custodianOptions.find(
              (option) => `Organization/${option.organization.id}` === custodianReference,
            )?.label || undefined,
        } satisfies Reference)
      : undefined

    const validationError = getPmoSubmissionError({
      hasAuthor: Boolean(authorRole),
      hasAttester: Boolean(attester),
      hasAuthenticator: Boolean(authenticator),
      hasPdf: Boolean(pdfFile),
    })
    if (validationError || !authorRole || !attester || !authenticator || !pdfFile) {
      setErrorMessage(validationError || 'Unable to validate the PMO form.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      // Convert browser-only form values before handing the workflow domain-ready FHIR data.
      // Preserve date-only precision in FHIR dateTime fields rather than inventing midnight.
      const signingTime = calendarDateValue(signedDate, 'signing date')
      const contextPeriodEndTime = calendarDateValue(contextPeriodEnd, 'relevant-through date')
      const pdfBase64 = await readFileAsBase64(pdfFile)
      const now = new Date().toISOString()

      console.log(
        [
          'Creating an ADI document with the following data:',
          `- Patient: ${getDisplayNameFromHumanName(patient.name?.[0]) || patient.id || patientId}`,
          `- Source server: ${activeServer.label} (${activeServer.baseUrl})`,
          `- Destination server: ${destinationServer.label} (${destinationServer.baseUrl})`,
          `- Document status: ${status}`,
          `- Author (PractitionerRole): ${getPractitionerRoleDisplayName(authorRole, practitionerByReference)}`,
          `- Facilitator: ${facilitator?.display || 'None'}`,
          `- Data enterer: ${dataEnterer?.display || 'None'}`,
          `- Attester party: ${attester.display}`,
          `- Authenticator party: ${authenticator.display || authenticator.reference || 'Unknown'}`,
          `- Custodian (Organization): ${custodian?.display || custodian?.reference || 'None'}`,
          `- Date signed: ${signedDate}`,
          `- Relevant through: ${contextPeriodEnd}`,
          `- Source form PDF: ${pdfFile.name}`,
        ].join('\n'),
      )

      await createPmoDocument({
        sourceBaseUrl: activeServer.baseUrl,
        destinationBaseUrl: destinationServer.baseUrl,
        patient,
        practitionerRole: authorRole,
        practitionerByReference,
        author: {
          reference: `PractitionerRole/${authorRole.id}`,
          display: getPractitionerRoleDisplayName(authorRole, practitionerByReference),
        },
        attester: { reference: attester.reference, display: attester.display },
        authenticator,
        facilitator,
        dataEnterer: dataEnterer ? { reference: dataEnterer.reference, display: dataEnterer.display } : undefined,
        custodian,
        status,
        signedDate: signingTime,
        contextPeriodEnd: contextPeriodEndTime,
        createdAt: now,
        pdfBase64,
        jurisdiction,
      })

      setRouteNotification({
        routeHref: getRouteHref(`/patients/${patientId}?view=documents`),
        message: `ADI PMO created successfully on ${destinationServer.label}.`,
        tone: 'success',
      })
      navigateTo(`/patients/${patientId}?view=documents`)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to create the ADI POLST PMO document.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!activeServer) {
    return null
  }

  return (
    <section className="panel">
      <PatientFormHeader title="Create ADI PMO" patient={patient}
        serverLabel={activeServer.label} serverBaseUrl={activeServer.baseUrl}
        onBack={() => navigateTo(`/patients/${patientId}?view=documents`)} />
      <>

        {isLoading ? <div className="info-banner">Loading PMO creation form...</div> : null}
        {(isLoading || !patient) && errorMessage ? <div className="error-banner" role="alert">{errorMessage}</div> : null}

        {!isLoading && patient ? (
          <SubmissionForm error={errorMessage} validate={validateForm} onSubmit={handleSubmit}>
            <DestinationServerField
              id="pmo-destination-server"
              servers={savedServers}
              value={destinationBaseUrl}
              disabled={isSubmitting}
              onChange={setDestinationBaseUrl}
            />
            <SubmissionErrors error={errorMessage} />

            <ValidationField field="pmo-status" className="field-group">
              <label htmlFor="pmo-status">Document status</label>
              <select
                id="pmo-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as PmoStatus)}
                disabled={isSubmitting}
              >
                <option value="preliminary">Preliminary</option>
                <option value="final">Final</option>
                <option value="amended">Amended</option>
              </select>
            </ValidationField>

            <ValidationField field="pmo-author" className="field-group">
              <label htmlFor="pmo-author">Author (PractitionerRole)</label>
              <select
                id="pmo-author"
                value={authorRoleId}
                onChange={(event) => setAuthorRoleId(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">Select an author</option>
                {practitionerRoles.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </ValidationField>

            <ValidationField field="pmo-facilitator" className="field-group">
              <label htmlFor="pmo-facilitator">Facilitator</label>
              <select
                id="pmo-facilitator"
                value={facilitatorReference}
                onChange={(event) => setFacilitatorReference(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">None</option>
                {facilitatorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </ValidationField>

            <ValidationField field="pmo-data-enterer" className="field-group">
              <label htmlFor="pmo-data-enterer">Data enterer</label>
              <select
                id="pmo-data-enterer"
                value={dataEntererReference}
                onChange={(event) => setDataEntererReference(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">None</option>
                {dataEntererOptions.map((option) => (
                  <option key={option.reference} value={option.reference}>
                    {option.label}
                  </option>
                ))}
              </select>
            </ValidationField>

            <ValidationField field="pmo-attester" className="field-group">
              <label htmlFor="pmo-attester">Attester party</label>
              <select
                id="pmo-attester"
                value={attesterReference}
                onChange={(event) => setAttesterReference(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">Select an attester</option>
                {attesterOptions.map((option) => (
                  <option key={option.reference} value={option.reference}>
                    {option.label}
                  </option>
                ))}
              </select>
            </ValidationField>

            <ValidationField field="pmo-authenticator" className="field-group">
              <label htmlFor="pmo-authenticator">Authenticator party</label>
              <select
                id="pmo-authenticator"
                value={authenticatorReference}
                onChange={(event) => setAuthenticatorReference(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">Select an authenticator</option>
                {authenticatorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </ValidationField>

            <ValidationField field="pmo-custodian" className="field-group">
              <label htmlFor="pmo-custodian">Custodian (Organization)</label>
              <select
                id="pmo-custodian"
                value={custodianReference}
                onChange={(event) => setCustodianReference(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">None</option>
                {custodianOptions.map((option) => (
                  <option key={option.value} value={`Organization/${option.value}`}>
                    {option.label}
                  </option>
                ))}
              </select>
            </ValidationField>

            <ValidationField field="pmo-signed-date" className="field-group">
              <label htmlFor="pmo-signed-date">Date signed</label>
              <input
                id="pmo-signed-date"
                type="date"
                value={signedDate}
                onChange={(event) => setSignedDate(event.target.value)}
                disabled={isSubmitting}
              />
            </ValidationField>

            <ValidationField field="pmo-context-period-end" className="field-group">
              <label htmlFor="pmo-context-period-end">Relevant through</label>
              <input
                id="pmo-context-period-end"
                type="date"
                value={contextPeriodEnd}
                onChange={(event) => {
                  setContextPeriodEnd(event.target.value)
                  setHasEditedContextPeriodEnd(true)
                }}
                disabled={isSubmitting}
              />
            </ValidationField>

            <ValidationField field="pmo-pdf" className="field-group">
              <label htmlFor="pmo-pdf">Source form PDF</label>
              <input
                id="pmo-pdf"
                type="file"
                accept="application/pdf"
                onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
                disabled={isSubmitting}
              />
            </ValidationField>

            <p className="file-input-hint">
              Upload the PDF source form. It will be embedded in the generated ADI Bundle as
              base64 attachment data.
            </p>

            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create ADI PMO'}
              </button>
            </div>
          </SubmissionForm>
        ) : null}
      </>
    </section>
  )
}
