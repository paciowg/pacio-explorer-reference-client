/** Combines patient demographics and clinical selections into the page's presentation model. */
import type { Bundle, Patient } from 'fhir/r4'
import type { ClinicalListItem, SelectableClinicalListItem } from '../../components/clinicalTypes'
import { buildClinicalSummary } from './clinicalSummary'
import { buildPatientDemographics, type EmergencyContact } from './patientDemographics'

export type { ClinicalListItem, SelectableClinicalListItem } from '../../components/clinicalTypes'
export type { EmergencyContact } from './patientDemographics'
export {
  getBirthSex,
  getEmergencyContacts,
  getLanguage,
  getMaritalStatus,
  getUsCoreCategoryDisplay,
} from './patientDemographics'

export type PatientSummaryModel = {
  patientId: string
  patientName: string
  patientMeta: string
  bundleStatusText: string
  bundleStatusTone: 'success' | 'warning'
  personalInformation: {
    firstName: string
    lastName: string
    birthDate: string
    gender: string
    birthSex: string
    maritalStatus: string
    mrn: string
  }
  demographics: { race: string; ethnicity: string; language: string }
  contactInformation: { address: string; phone: string; email: string }
  emergencyContacts: EmergencyContact[]
  activeProblems: ClinicalListItem[]
  currentMedications: ClinicalListItem[]
  knownAllergies: ClinicalListItem[]
  mostRecentVitals: ClinicalListItem[]
  advanceDirectives: SelectableClinicalListItem[]
  transitionOfCares: SelectableClinicalListItem[]
  clinicalSectionEmptyMessage: string
}

export function buildPatientSummaryModel(input: {
  patient: Patient
  bundle: Bundle | null
  bundleAvailable: boolean
}): PatientSummaryModel {
  const { patient, bundle, bundleAvailable } = input
  const demographicModel = buildPatientDemographics(patient)
  const clinicalSummary = buildClinicalSummary(bundleAvailable ? bundle : null)

  return {
    ...demographicModel,
    bundleStatusText: bundleAvailable ? '' : 'Showing patient-only fallback data',
    bundleStatusTone: bundleAvailable ? 'success' : 'warning',
    ...clinicalSummary,
    clinicalSectionEmptyMessage: bundleAvailable ? 'None recorded' : 'Unavailable',
  }
}
