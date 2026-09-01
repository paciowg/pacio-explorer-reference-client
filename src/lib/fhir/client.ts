/** Provides the application's small FHIR R4 transport layer and endpoint-specific validation. */
import type {
  Bundle,
  BundleEntry,
  BundleLink,
  CapabilityStatement,
  DocumentReference,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
  RelatedPerson,
  Resource,
} from 'fhir/r4'
import { normalizeBaseUrl } from './url'

type FhirJson =
  | Bundle
  | CapabilityStatement
  | DocumentReference
  | Organization
  | Patient
  | Practitioner
  | PractitionerRole
  | RelatedPerson
  | Resource

const DEFAULT_PATIENT_EVERYTHING_MAX_RESULTS = 500
const DEFAULT_PATIENT_EVERYTHING_PAGE_COUNT = 250

async function fhirGet<T extends FhirJson>(baseUrl: string, path: string): Promise<T> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const response = await fetch(`${normalizedBaseUrl}${path}`, {
    // Avoid stale FHIR responses when a server is reset and reuses resource URLs.
    cache: 'no-store',
    headers: {
      Accept: 'application/fhir+json, application/json',
    },
  })

  return parseFhirResponse<T>(response)
}

async function fhirGetAbsolute<T extends FhirJson>(url: string): Promise<T> {
  const response = await fetch(url, {
    // Avoid stale FHIR responses when a server is reset and reuses resource URLs.
    cache: 'no-store',
    headers: {
      Accept: 'application/fhir+json, application/json',
    },
  })

  return parseFhirResponse<T>(response)
}

async function fhirPost<TResponse = Resource>(
  baseUrl: string,
  resourceType: string,
  body: Resource,
): Promise<TResponse> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const response = await fetch(`${normalizedBaseUrl}/${resourceType}`, {
    method: 'POST',
    // Keep all app requests out of the browser HTTP cache for consistency.
    cache: 'no-store',
    headers: {
      Accept: 'application/fhir+json, application/json',
      'Content-Type': 'application/fhir+json',
    },
    body: JSON.stringify(body),
  })

  return parseFhirResponse<TResponse>(response)
}

async function parseFhirResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  const hasJsonBody = contentType.includes('json')
  const responseText = hasJsonBody ? await response.text() : ''
  const payload = responseText ? JSON.parse(responseText) : null

  if (!response.ok) {
    const operationOutcomeIssue = payload?.issue?.[0]
    const issueText =
      operationOutcomeIssue?.diagnostics ||
      operationOutcomeIssue?.details?.text ||
      operationOutcomeIssue?.code

    throw new Error(issueText || `FHIR request failed with status ${response.status}.`)
  }

  return payload as T
}

function getNextLink(bundle: Bundle) {
  return bundle.link?.find((link: BundleLink) => link.relation === 'next')?.url
}

function mergeBundles(bundles: Bundle[]): Bundle {
  const allEntries: BundleEntry[] = []
  const seenKeys = new Set<string>()

  for (const bundle of bundles) {
    for (const entry of bundle.entry ?? []) {
      // Broad $everything includes can repeat the same resource on later pages.
      const resourceType = entry.resource?.resourceType || 'unknown'
      const resourceId = entry.resource?.id || entry.fullUrl || JSON.stringify(entry.resource)
      const key = `${resourceType}-${resourceId}`

      if (seenKeys.has(key)) continue

      seenKeys.add(key)
      allEntries.push(entry)
    }
  }

  const firstBundle = bundles[0]

  return {
    ...firstBundle,
    entry: allEntries,
    total: allEntries.length,
    link: firstBundle.link?.filter((link) => link.relation !== 'next'),
  }
}

async function fetchPaginatedBundle(
  initialPath: string,
  baseUrl: string,
  maxResults: number,
): Promise<Bundle> {
  const bundles: Bundle[] = []
  let bundle = await fhirGet<Bundle>(baseUrl, initialPath)

  if (bundle.resourceType !== 'Bundle') {
    throw new Error('The server did not return a Bundle resource.')
  }

  bundles.push(bundle)
  let collectedEntries = bundle.entry?.length ?? 0
  let nextUrl = getNextLink(bundle)

  // Stop between complete server pages; the merged result can therefore slightly exceed maxResults.
  while (nextUrl && collectedEntries < maxResults) {
    const nextBundle = await fhirGetAbsolute<Bundle>(nextUrl)

    if (nextBundle.resourceType !== 'Bundle') {
      throw new Error('The server did not return a Bundle resource.')
    }

    bundles.push(nextBundle)
    collectedEntries += nextBundle.entry?.length ?? 0
    nextUrl = getNextLink(nextBundle)
  }

  return mergeBundles(bundles)
}

export async function validateFhirServer(baseUrl: string) {
  const capabilityStatement = await fhirGet<CapabilityStatement>(baseUrl, '/metadata')

  if (capabilityStatement.resourceType !== 'CapabilityStatement') {
    throw new Error('The server metadata endpoint did not return a CapabilityStatement.')
  }

  const fhirVersion = capabilityStatement.fhirVersion || ''
  if (!fhirVersion.startsWith('4.')) {
    throw new Error(
      `Unsupported FHIR version: ${fhirVersion || 'unknown'}. Phase 1 targets FHIR R4.`,
    )
  }

  return capabilityStatement
}

export async function fetchPatients(baseUrl: string, count = 100) {
  return fhirGet<Bundle>(baseUrl, `/Patient?_count=${count}`)
}

export async function searchPatients(
  baseUrl: string,
  parameters: { identifier?: string; family?: string; given?: string },
) {
  const searchParams = new URLSearchParams({ _count: '100' })
  if (parameters.identifier) searchParams.set('identifier', parameters.identifier)
  if (parameters.family) searchParams.set('family', parameters.family)
  if (parameters.given) searchParams.set('given', parameters.given)

  const bundle = await fhirGet<Bundle>(baseUrl, `/Patient?${searchParams.toString()}`)
  if (bundle.resourceType !== 'Bundle') {
    throw new Error('The server did not return a Patient search Bundle.')
  }
  return bundle
}

export async function fetchPatient(baseUrl: string, patientId: string) {
  const patient = await fhirGet<Patient>(baseUrl, `/Patient/${encodeURIComponent(patientId)}`)

  if (patient.resourceType !== 'Patient') {
    throw new Error('The server did not return a Patient resource.')
  }

  return patient
}

export async function fetchDocumentReference(baseUrl: string, documentReferenceId: string) {
  const documentReference = await fhirGet<DocumentReference>(
    baseUrl,
    `/DocumentReference/${encodeURIComponent(documentReferenceId)}`,
  )

  if (documentReference.resourceType !== 'DocumentReference') {
    throw new Error('The server did not return a DocumentReference resource.')
  }

  return documentReference
}

export async function fetchBundle(baseUrl: string, bundleId: string) {
  const bundle = await fhirGet<Bundle>(baseUrl, `/Bundle/${encodeURIComponent(bundleId)}`)

  if (bundle.resourceType !== 'Bundle') {
    throw new Error('The server did not return a Bundle resource.')
  }

  return bundle
}

export async function fetchBundleByReference(baseUrl: string, reference: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const trimmedReference = reference.trim()

  if (!trimmedReference) {
    throw new Error('Bundle reference was empty.')
  }

  if (trimmedReference.startsWith('http://') || trimmedReference.startsWith('https://')) {
    // The browser client does not follow document links to another server or trust domain.
    if (!trimmedReference.startsWith(`${normalizedBaseUrl}/`)) {
      throw new Error(`Unsupported external Bundle reference: ${reference}`)
    }

    const relativePath = trimmedReference.slice(normalizedBaseUrl.length)
    const bundle = await fhirGet<Bundle>(
      baseUrl,
      relativePath.startsWith('/') ? relativePath : `/${relativePath}`,
    )

    if (bundle.resourceType !== 'Bundle') {
      throw new Error('The server did not return a Bundle resource.')
    }

    return bundle
  }

  const normalizedReference = trimmedReference.replace(/^\/+/, '')

  if (!normalizedReference.startsWith('Bundle/')) {
    throw new Error(`Unsupported Bundle reference format: ${reference}`)
  }

  const bundle = await fhirGet<Bundle>(baseUrl, `/${normalizedReference}`)

  if (bundle.resourceType !== 'Bundle') {
    throw new Error('The server did not return a Bundle resource.')
  }

  return bundle
}

export async function fetchPractitionerRoles(baseUrl: string, count = 100) {
  return fhirGet<Bundle>(
    baseUrl,
    `/PractitionerRole?_count=${count}&_include=PractitionerRole:practitioner`,
  )
}

export async function fetchOrganizations(baseUrl: string, count = 100) {
  return fhirGet<Bundle>(baseUrl, `/Organization?_count=${count}`)
}

export async function fetchRelatedPersons(baseUrl: string, patientId: string, count = 100) {
  return fhirGet<Bundle>(
    baseUrl,
    `/RelatedPerson?patient=${encodeURIComponent(patientId)}&_count=${count}`,
  )
}

export async function fetchResourceByReference(baseUrl: string, reference: string) {
  const normalizedReference = reference.trim().replace(/^\/+/, '')

  if (!normalizedReference.includes('/')) {
    throw new Error(`Unsupported reference format: ${reference}`)
  }

  const resource = await fhirGet<Resource>(baseUrl, `/${normalizedReference}`)

  if (!resource.resourceType || !resource.id) {
    throw new Error(`The server did not return a valid resource for reference ${reference}.`)
  }

  return resource
}

export async function createBundle(baseUrl: string, bundle: Bundle) {
  return fhirPost<Bundle>(baseUrl, 'Bundle', bundle)
}

export async function createDocumentReference(
  baseUrl: string,
  documentReference: DocumentReference,
) {
  return fhirPost<DocumentReference>(baseUrl, 'DocumentReference', documentReference)
}

export async function createPatient(baseUrl: string, patient: Patient) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const response = await fetch(`${normalizedBaseUrl}/Patient`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/fhir+json, application/json',
      'Content-Type': 'application/fhir+json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patient),
  })
  const createdPatient = await parseFhirResponse<Patient | null>(response)

  if (createdPatient?.resourceType === 'Patient' && createdPatient.id) {
    return createdPatient
  }

  const location = response.headers.get('location') || response.headers.get('content-location') || ''
  const patientId = location.match(/(?:^|\/)Patient\/([^/?]+)(?:\/_history\/[^/?]+)?(?:[/?]|$)/)?.[1]
  if (!patientId) {
    throw new Error('The server did not return an id for the created Patient.')
  }

  return { ...patient, id: decodeURIComponent(patientId) }
}

export async function fetchPatientEverything(
  baseUrl: string,
  patientId: string,
  options?: {
    maxResults?: number
    pageCount?: number
  },
) {
  const maxResults = options?.maxResults ?? DEFAULT_PATIENT_EVERYTHING_MAX_RESULTS
  const pageCount = options?.pageCount ?? DEFAULT_PATIENT_EVERYTHING_PAGE_COUNT

  // Includes provide enough neighboring resources to build summaries and follow document references.
  const searchParams = new URLSearchParams({
    _count: String(pageCount),
    _include: '*',
    _revinclude: '*',
    '_include:iterate': '*',
  })

  return fetchPaginatedBundle(
    `/Patient/${encodeURIComponent(patientId)}/$everything?${searchParams.toString()}`,
    baseUrl,
    maxResults,
  )
}
