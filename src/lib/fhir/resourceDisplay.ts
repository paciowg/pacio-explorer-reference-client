/** Derives concise human-readable labels from common FHIR resources with safe fallbacks. */
import type {
  AllergyIntolerance,
  CarePlan,
  Composition,
  Condition,
  Device,
  DeviceRequest,
  DiagnosticReport,
  DocumentReference,
  Encounter,
  Goal,
  Immunization,
  List,
  Medication,
  MedicationRequest,
  MedicationStatement,
  Observation,
  Procedure,
  QuestionnaireResponse,
  Resource,
  ServiceRequest,
} from 'fhir/r4'
import { getCodeableConceptText, getNarrativeText } from './formatters'

function referenceDisplay(display: string | undefined, reference: string | undefined) {
  return display?.trim() || reference?.trim() || ''
}

/** Returns a simple label suitable for resource-selection lists and compact summaries. */
export function getSimpleResourceDisplay(resource: Resource) {
  let display = ''
  switch (resource.resourceType) {
    case 'AllergyIntolerance': display = getCodeableConceptText((resource as AllergyIntolerance).code); break
    case 'CarePlan': display = (resource as CarePlan).title || (resource as CarePlan).description || ''; break
    case 'Composition': display = (resource as Composition).title || getCodeableConceptText((resource as Composition).type); break
    case 'Condition': display = getCodeableConceptText((resource as Condition).code); break
    case 'Device': display = (resource as Device).deviceName?.find((name) => name.name?.trim())?.name || getCodeableConceptText((resource as Device).type); break
    case 'DeviceRequest': {
      const request = resource as DeviceRequest
      display = getCodeableConceptText(request.codeCodeableConcept) || referenceDisplay(request.codeReference?.display, request.codeReference?.reference)
      break
    }
    case 'DiagnosticReport': display = getCodeableConceptText((resource as DiagnosticReport).code); break
    case 'DocumentReference': display = (resource as DocumentReference).description || getCodeableConceptText((resource as DocumentReference).type); break
    case 'Encounter': {
      const encounter = resource as Encounter
      display = getCodeableConceptText(encounter.type?.[0]) || encounter.class?.display || encounter.class?.code || getCodeableConceptText(encounter.reasonCode?.[0])
      break
    }
    case 'Goal': display = (resource as Goal).description?.text || ''; break
    case 'Immunization': display = getCodeableConceptText((resource as Immunization).vaccineCode); break
    case 'List': display = (resource as List).title || getCodeableConceptText((resource as List).code); break
    case 'Medication': display = getCodeableConceptText((resource as Medication).code); break
    case 'MedicationRequest': {
      const request = resource as MedicationRequest
      display = getCodeableConceptText(request.medicationCodeableConcept) || referenceDisplay(request.medicationReference?.display, request.medicationReference?.reference)
      break
    }
    case 'MedicationStatement': {
      const statement = resource as MedicationStatement
      display = getCodeableConceptText(statement.medicationCodeableConcept) || referenceDisplay(statement.medicationReference?.display, statement.medicationReference?.reference)
      break
    }
    case 'Observation': display = getCodeableConceptText((resource as Observation).code); break
    case 'Procedure': display = getCodeableConceptText((resource as Procedure).code); break
    case 'QuestionnaireResponse': {
      const response = resource as QuestionnaireResponse
      display = getNarrativeText(response.text) || response.questionnaire || ''
      break
    }
    case 'ServiceRequest': display = getCodeableConceptText((resource as ServiceRequest).code); break
  }
  return display.trim() || `${resource.resourceType}${resource.id ? `/${resource.id}` : ''}`
}
