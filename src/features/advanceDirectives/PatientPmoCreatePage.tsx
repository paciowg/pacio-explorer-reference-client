import { useEffect, useMemo, useState } from 'react'
import type {
  Bundle,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
  Reference,
  RelatedPerson,
  Resource,
} from 'fhir/r4'
import {
  fetchOrganizations,
  fetchPatient,
  fetchPractitionerRoles,
  fetchRelatedPersons,
} from '../../lib/fhir/client'
import {
  getCodeableConceptText,
  getDisplayNameFromHumanName,
  getPractitionerDisplayName,
  getPractitionerRoleDisplayName,
} from '../../lib/fhir/formatters'
import { getRouteHref, navigateTo } from '../../lib/routing/routes'
import { useSavedServers } from '../servers/useSavedServers'
import { type PmoAttesterOption, type PmoDataEntererOption } from '../../igs/pacioAdi/pmoDocument'
import { setRouteNotification } from '../../lib/routing/routeNotification'
import { readFileAsBase64 } from './browserFiles'
import { createPmoDocument } from './createPmoDocument'
import {
  addOneYearToDateValue as calculateContextPeriodEnd,
  getPatientJurisdiction as calculatePatientJurisdiction,
  getPmoSubmissionError,
  toIsoDateTimeLocalValue as formatDateInput,
  toUtcMidnightIso as toUtcMidnight,
} from './pmoFormModel'

type PatientPmoCreatePageProps = {
  patientId: string
}

type PmoStatus = 'preliminary' | 'final' | 'amended'

type PractitionerRoleOption = {
  value: string
  label: string
  role: PractitionerRole
}

type OrganizationOption = {
  value: string
  label: string
  organization: Organization
}

type FacilitatorOption = {
  value: string
  label: string
  reference: Reference
}

function getPractitionerMap(bundle: Bundle) {
  const map = new Map<string, Practitioner>()

  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource
    if (!isPractitioner(resource) || !resource.id) continue
    map.set(`Practitioner/${resource.id}`, resource)
  }

  return map
}

function isPractitioner(resource: Resource | undefined): resource is Practitioner {
  return resource?.resourceType === 'Practitioner'
}

function getPractitionerRoleOptions(
  bundle: Bundle,
  practitionerByReference: Map<string, Practitioner>,
) {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is PractitionerRole => resource?.resourceType === 'PractitionerRole')
    .filter((role) => Boolean(role.id))
    .map((role) => ({
      value: role.id!,
      label: getPractitionerRoleDisplayName(role, practitionerByReference),
      role,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function getAuthenticatorOptions(roleOptions: PractitionerRoleOption[]) {
  return roleOptions.map((roleOption) => ({
    value: `PractitionerRole/${roleOption.role.id}`,
    label: roleOption.label,
    reference: {
      reference: `PractitionerRole/${roleOption.role.id}`,
      display: roleOption.label,
    },
  }))
}

function getFacilitatorOptions(roleOptions: PractitionerRoleOption[]): FacilitatorOption[] {
  return roleOptions.map((roleOption) => ({
    value: `PractitionerRole/${roleOption.role.id}`,
    label: roleOption.label,
    reference: {
      reference: `PractitionerRole/${roleOption.role.id}`,
      display: roleOption.label,
    },
  }))
}

function getOrganizationDisplayName(organization: Organization) {
  return organization.name || organization.alias?.find(Boolean) || organization.id || 'Organization'
}

function getOrganizationOptions(bundle: Bundle): OrganizationOption[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is Organization => resource?.resourceType === 'Organization')
    .filter((organization) => Boolean(organization.id))
    .map((organization) => ({
      value: organization.id!,
      label: getOrganizationDisplayName(organization),
      organization,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function getRelatedPersons(bundle: Bundle): RelatedPerson[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is RelatedPerson => resource?.resourceType === 'RelatedPerson')
    .filter((relatedPerson) => Boolean(relatedPerson.id))
    .sort((a, b) => {
      const aName = getDisplayNameFromHumanName(a.name?.[0]) || a.id || ''
      const bName = getDisplayNameFromHumanName(b.name?.[0]) || b.id || ''
      return aName.localeCompare(bName)
    })
}

function getRelatedPersonDisplayName(relatedPerson: RelatedPerson) {
  const name =
    getDisplayNameFromHumanName(relatedPerson.name?.[0]) ||
    relatedPerson.patient?.display ||
    relatedPerson.id ||
    'Related person'

  const relationship =
    relatedPerson.relationship?.length
      ? getCodeableConceptText(relatedPerson.relationship[0])
      : ''

  return relationship ? `${name} — RelatedPerson (${relationship})` : `${name} — RelatedPerson`
}

function getAttesterOptions(
  patient: Patient | null,
  roleOptions: PractitionerRoleOption[],
  relatedPersons: RelatedPerson[],
) {
  const options: PmoAttesterOption[] = []

  if (patient?.id) {
    options.push({
      reference: `Patient/${patient.id}`,
      display:
        `${getDisplayNameFromHumanName(patient.name?.[0]) || patient.id || 'Patient'} — Patient`,
    })
  }

  for (const relatedPerson of relatedPersons) {
    if (!relatedPerson.id) continue

    options.push({
      reference: `RelatedPerson/${relatedPerson.id}`,
      display: getRelatedPersonDisplayName(relatedPerson),
    })
  }

  for (const roleOption of roleOptions) {
    options.push({
      reference: `PractitionerRole/${roleOption.role.id}`,
      display: roleOption.label,
    })
  }

  return options
}

function getDataEntererOptions(
  patient: Patient | null,
  roleOptions: PractitionerRoleOption[],
  practitionerByReference: Map<string, Practitioner>,
  relatedPersons: RelatedPerson[],
): PmoDataEntererOption[] {
  const options: PmoDataEntererOption[] = []
  const practitionerReferencesCoveredByRole = new Set<string>()

  if (patient?.id) {
    options.push({
      reference: `Patient/${patient.id}`,
      display:
        `${getDisplayNameFromHumanName(patient.name?.[0]) || patient.id || 'Patient'} — Patient`,
    })
  }

  for (const relatedPerson of relatedPersons) {
    if (!relatedPerson.id) continue

    options.push({
      reference: `RelatedPerson/${relatedPerson.id}`,
      display: getRelatedPersonDisplayName(relatedPerson),
    })
  }

  for (const roleOption of roleOptions) {
    options.push({
      reference: `PractitionerRole/${roleOption.role.id}`,
      display: roleOption.label,
    })

    const practitionerReference = roleOption.role.practitioner?.reference
    if (practitionerReference) {
      practitionerReferencesCoveredByRole.add(practitionerReference)
    }
  }

  for (const [practitionerReference, practitioner] of practitionerByReference.entries()) {
    if (practitionerReferencesCoveredByRole.has(practitionerReference)) continue

    options.push({
      reference: practitionerReference,
      display: `${getPractitionerDisplayName(practitioner) || practitioner.id || practitionerReference} — Practitioner`,
    })
  }

  return options
}

export function PatientPmoCreatePage({ patientId }: PatientPmoCreatePageProps) {
  const { activeServer } = useSavedServers()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [practitionerRoles, setPractitionerRoles] = useState<PractitionerRoleOption[]>([])
  const [practitionerByReference, setPractitionerByReference] = useState<
    Map<string, Practitioner>
  >(new Map())
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
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

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

        const practitionerMap = getPractitionerMap(practitionerRoleBundle)
        const roleOptions = getPractitionerRoleOptions(practitionerRoleBundle, practitionerMap)
        const organizations = getOrganizationOptions(organizationBundle)
        const relatedPersonOptions = getRelatedPersons(relatedPersonBundle)

        setPatient(patientResult)
        setPractitionerByReference(practitionerMap)
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
        practitionerByReference,
        relatedPersons,
      ),
    [patient, practitionerRoles, practitionerByReference, relatedPersons],
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!activeServer || !patient) return

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
      const pdfBase64 = await readFileAsBase64(pdfFile)
      const now = new Date().toISOString()
      const signingTime = toUtcMidnight(signedDate)
      const contextPeriodEndTime = toUtcMidnight(contextPeriodEnd)

      console.log(
        [
          'Creating an ADI document with the following data:',
          `- Patient: ${getDisplayNameFromHumanName(patient.name?.[0]) || patient.id || patientId}`,
          `- Server: ${activeServer.label} (${activeServer.baseUrl})`,
          `- Document status: ${status}`,
          `- Author (PractitionerRole): ${getPractitionerRoleDisplayName(authorRole, practitionerByReference)}`,
          `- Facilitator: ${facilitator?.display || 'None'}`,
          `- Data enterer: ${dataEnterer?.display || 'None'}`,
          `- Attester party: ${attester.display}`,
          `- Authenticator party: ${authenticator.display || authenticator.reference || 'Unknown'}`,
          `- Custodian (Organization): ${custodian?.display || custodian?.reference || 'None'}`,
          `- Date signed: ${signedDate}`,
          `- Relevant through: ${contextPeriodEnd}`,
          `- Signing time (UTC): ${signingTime}`,
          `- Context period end (UTC): ${contextPeriodEndTime}`,
          `- Source form PDF: ${pdfFile.name}`,
        ].join('\n'),
      )

      await createPmoDocument({
        baseUrl: activeServer.baseUrl,
        patient,
        practitionerRole: authorRole,
        practitionerByReference,
        subject: {
          reference: `Patient/${patient.id}`,
          display: getDisplayNameFromHumanName(patient.name?.[0]) || patient.id || '',
        },
        author: {
          reference: `PractitionerRole/${authorRole.id}`,
          display: getPractitionerRoleDisplayName(authorRole, practitionerByReference),
        },
        attester,
        authenticator,
        facilitator,
        dataEnterer,
        custodian,
        status,
        signedDate: signingTime,
        contextPeriodEnd: contextPeriodEndTime,
        createdAt: now,
        pdfBase64,
        jurisdiction,
      })

      setRouteNotification({
        routeHref: getRouteHref(`/patients/${patientId}`),
        message: 'ADI PMO created successfully.',
        tone: 'success',
      })
      navigateTo(`/patients/${patientId}`)
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
      <div className="panel-header">
        <div>
          <h2>Create ADI PMO</h2>
        </div>

        <div className="panel-server-details">
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

        {isLoading ? <div className="info-banner">Loading PMO creation form...</div> : null}
        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

        {!isLoading && patient ? (
          <form onSubmit={handleSubmit}>
            <div className="field-group">
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
            </div>

            <div className="field-group">
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
            </div>

            <div className="field-group">
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
            </div>

            <div className="field-group">
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
                    {option.display}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
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
                    {option.display}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
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
            </div>

            <div className="field-group">
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
            </div>

            <div className="field-group">
              <label htmlFor="pmo-signed-date">Date signed</label>
              <input
                id="pmo-signed-date"
                type="date"
                value={signedDate}
                onChange={(event) => setSignedDate(event.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="field-group">
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
            </div>

            <div className="field-group">
              <label htmlFor="pmo-pdf">Source form PDF</label>
              <input
                id="pmo-pdf"
                type="file"
                accept="application/pdf"
                onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
                disabled={isSubmitting}
              />
            </div>

            <p className="file-input-hint">
              Upload the PDF source form. It will be embedded in the generated ADI Bundle as
              base64 attachment data.
            </p>

            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create ADI PMO'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  )
}
