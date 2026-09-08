/** Classifies patient resources for TOC sections and derives readable TOC list and detail models. */
import type {
  AllergyIntolerance,
  Bundle,
  CarePlan,
  Composition,
  Condition,
  DeviceRequest,
  DiagnosticReport,
  DocumentReference,
  Encounter,
  Goal,
  Immunization,
  List,
  MedicationRequest,
  MedicationStatement,
  Observation,
  Procedure,
  Questionnaire,
  QuestionnaireResponse,
  Resource,
  ServiceRequest,
} from 'fhir/r4'
import type { SelectableClinicalListItem } from '../../components/clinicalTypes'
import {
  TOC_DOCUMENT_REFERENCE_PROFILE,
  TOC_SECTION_DEFINITIONS,
  TOC_TYPE_CODE,
  type TocSectionKey,
} from '../../igs/pacioToc/tocDocument'
import { createBundleIndex } from '../../lib/fhir/bundleIndex'
import { formatDate, getCodeableConceptText, getNarrativeText } from '../../lib/fhir/formatters'
import { getSimpleResourceDisplay } from '../../lib/fhir/resourceDisplay'

const ADI_DOCUMENT_REFERENCE_PROFILE = 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-DocumentReference'

export type TocResourceOption = {
  reference: string
  resource: Resource
  title: string
  secondaryText?: string
  dateValue?: string
}

export type TocSectionOptions = {
  key: TocSectionKey
  title: string
  options: TocResourceOption[]
}

/** Returns the form label preferred for QuestionnaireResponse selection when its response narrative is absent. */
export function getQuestionnaireDisplay(questionnaire: Questionnaire) {
  return questionnaire.title?.trim() || questionnaire.code
    ?.map((coding) => coding.display?.trim())
    .find(Boolean) || ''
}

function resources(bundle: Bundle | null) {
  return bundle?.entry?.flatMap((entry) => entry.resource ? [entry.resource] : []) ?? []
}

/** Finds distinct Questionnaire canonicals used by responses in a patient Bundle. */
export function getQuestionnaireResponseReferences(bundle: Bundle | null) {
  return [...new Set(resources(bundle)
    .filter((resource): resource is QuestionnaireResponse => resource.resourceType === 'QuestionnaireResponse')
    .filter((response) => !getNarrativeText(response.text))
    .map((response) => response.questionnaire?.trim())
    .filter((reference): reference is string => Boolean(reference)))]
}

function hasCode(concepts: { coding?: { code?: string }[] }[] | undefined, code: string) {
  return concepts?.some((concept) => concept.coding?.some((coding) => coding.code === code)) ?? false
}

function observationCategory(resource: Resource, code: string) {
  return resource.resourceType === 'Observation' && hasCode((resource as Observation).category, code)
}

function profileIncludes(resource: Resource, fragment: string) {
  return resource.meta?.profile?.some((profile) => profile.includes(fragment)) ?? false
}

function isAdiDocumentReference(resource: Resource) {
  if (resource.resourceType !== 'DocumentReference') return false
  const document = resource as DocumentReference
  return document.meta?.profile?.includes(ADI_DOCUMENT_REFERENCE_PROFILE) || hasCode(document.category, '42348-3')
}

function eligibleForSection(resource: Resource, key: TocSectionKey) {
  switch (key) {
    case 'advanceDirectives': return isAdiDocumentReference(resource)
    case 'allergies': return resource.resourceType === 'AllergyIntolerance'
    case 'behavioralHealth': return resource.resourceType === 'QuestionnaireResponse' || observationCategory(resource, 'cognitive-status') || observationCategory(resource, 'behavioral-health')
    case 'functionalStatus': return resource.resourceType === 'QuestionnaireResponse' || observationCategory(resource, 'functional-status') || profileIncludes(resource, 'pacio-pfe')
    case 'immunizations': return resource.resourceType === 'Immunization'
    case 'dischargeInstructions': return resource.resourceType === 'DiagnosticReport' || (resource.resourceType === 'DocumentReference' && !isAdiDocumentReference(resource))
    case 'medicalDevices': return resource.resourceType === 'Device' || resource.resourceType === 'DeviceRequest'
    case 'medications': return ['List', 'MedicationRequest', 'Medication', 'MedicationStatement'].includes(resource.resourceType)
    case 'planOfCare': return resource.resourceType === 'CarePlan' || resource.resourceType === 'Goal'
    case 'problems': return resource.resourceType === 'Condition'
    case 'procedures': return resource.resourceType === 'Procedure' || resource.resourceType === 'ServiceRequest'
    case 'reasonForTransfer': return ['Condition', 'Procedure', 'Observation', 'Composition', 'Encounter'].includes(resource.resourceType)
    case 'clinicalResults': return resource.resourceType === 'DiagnosticReport' || (resource.resourceType === 'Observation' && !observationCategory(resource, 'vital-signs') && !observationCategory(resource, 'functional-status') && !observationCategory(resource, 'social-history'))
    case 'socialHistory': return observationCategory(resource, 'social-history') || profileIncludes(resource, 'NarrativeHistoryOfStatus')
    case 'vitalSigns': return observationCategory(resource, 'vital-signs')
  }
}

function resourceDate(resource: Resource) {
  switch (resource.resourceType) {
    case 'AllergyIntolerance': return (resource as AllergyIntolerance).recordedDate
    case 'Condition': return (resource as Condition).recordedDate || (resource as Condition).onsetDateTime
    case 'Observation': return (resource as Observation).effectiveDateTime || (resource as Observation).issued
    case 'Procedure': return (resource as Procedure).performedDateTime || (resource as Procedure).performedPeriod?.start
    case 'Immunization': return (resource as Immunization).occurrenceDateTime
    case 'DiagnosticReport': return (resource as DiagnosticReport).effectiveDateTime || (resource as DiagnosticReport).issued
    case 'DocumentReference': return (resource as DocumentReference).date
    case 'MedicationStatement': return (resource as MedicationStatement).dateAsserted || (resource as MedicationStatement).effectiveDateTime
    case 'MedicationRequest': return (resource as MedicationRequest).authoredOn
    case 'CarePlan': return (resource as CarePlan).period?.start || (resource as CarePlan).created
    case 'Goal': return (resource as Goal).startDate
    case 'ServiceRequest': return (resource as ServiceRequest).authoredOn
    case 'Composition': return (resource as Composition).date
    case 'QuestionnaireResponse': return (resource as QuestionnaireResponse).authored
    case 'DeviceRequest': return (resource as DeviceRequest).authoredOn
    case 'Encounter': return (resource as Encounter).period?.start
    case 'List': return (resource as List).date
    default: return undefined
  }
}

function sortResourcesByDate(resourcesToSort: Resource[]) {
  return resourcesToSort
    .map((resource, index) => ({ resource, index, timestamp: Date.parse(resourceDate(resource) || '') }))
    .sort((a, b) => {
      const aHasDate = Number.isFinite(a.timestamp)
      const bHasDate = Number.isFinite(b.timestamp)
      if (aHasDate && bHasDate && a.timestamp !== b.timestamp) return b.timestamp - a.timestamp
      if (aHasDate !== bHasDate) return aHasDate ? -1 : 1
      return a.index - b.index
    })
    .map(({ resource }) => resource)
}

export function summarizeTocResource(
  resource: Resource,
  questionnaireLabels: ReadonlyMap<string, string> = new Map(),
): TocResourceOption | null {
  if (!resource.id) return null
  let secondaryText: string | undefined
  const response = resource.resourceType === 'QuestionnaireResponse'
    ? resource as QuestionnaireResponse
    : undefined
  const questionnaireLabel = response && !getNarrativeText(response.text)
    ? questionnaireLabels.get(response.questionnaire || '')
    : undefined
  const title = questionnaireLabel || getSimpleResourceDisplay(resource)
  if (resource.resourceType === 'DocumentReference') {
    const description = (resource as DocumentReference).description
    secondaryText = description && description !== title ? description : undefined
  }
  const rawDate = resourceDate(resource)
  return {
    reference: `${resource.resourceType}/${resource.id}`,
    resource,
    title,
    secondaryText,
    dateValue: rawDate ? formatDate(rawDate) : undefined,
  }
}

export function buildTocSectionOptions(
  bundle: Bundle | null,
  questionnaireLabels: ReadonlyMap<string, string> = new Map(),
): TocSectionOptions[] {
  const available = resources(bundle)
  return TOC_SECTION_DEFINITIONS.map((definition) => ({
    key: definition.key,
    title: definition.title,
    options: sortResourcesByDate(available.filter((resource) => eligibleForSection(resource, definition.key)))
      .map((resource) => summarizeTocResource(resource, questionnaireLabels))
      .filter((option): option is TocResourceOption => Boolean(option)),
  }))
}

export function isTocDocumentReference(resource: Resource): resource is DocumentReference {
  if (resource.resourceType !== 'DocumentReference' || !resource.id) return false
  const document = resource as DocumentReference
  return Boolean(document.meta?.profile?.includes(TOC_DOCUMENT_REFERENCE_PROFILE) ||
    document.type?.coding?.some((coding) => coding.code === TOC_TYPE_CODE))
}

export function getTocDocuments(bundle: Bundle | null): SelectableClinicalListItem[] {
  return resources(bundle).filter(isTocDocumentReference)
    .sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))
    .slice(0, 10)
    .map((document) => ({
      id: document.id!,
      title: getSimpleResourceDisplay(document),
      dateLabel: document.date ? 'Date' : undefined,
      dateValue: document.date ? formatDate(document.date) : undefined,
      secondaryText: document.docStatus || document.status,
    }))
}

export type TocViewSection = {
  title: string
  summary: string
  emptyReason: string
  entries: TocResourceOption[]
}

export function buildTocViewSections(bundle: Bundle, baseUrl: string): { composition: Composition; sections: TocViewSection[] } | null {
  const composition = resources(bundle).find((resource): resource is Composition => resource.resourceType === 'Composition')
  if (!composition) return null
  const index = createBundleIndex(bundle, baseUrl)
  return {
    composition,
    sections: (composition.section ?? []).map((section) => {
      const entries = (section.entry ?? []).flatMap((entry) => {
        const resolved = index.resolve(entry.reference, composition)
        const summary = resolved ? summarizeTocResource(resolved) : null
        return summary ? [summary] : []
      })
      const emptyReason = getCodeableConceptText(section.emptyReason)
      return {
        title: section.title || getCodeableConceptText(section.code) || 'Untitled section',
        summary: entries.length
          ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
          : emptyReason ? `No entries — ${emptyReason}` : 'No entries recorded',
        emptyReason,
        entries,
      }
    }),
  }
}
