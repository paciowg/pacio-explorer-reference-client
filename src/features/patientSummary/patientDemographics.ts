/** Extracts display-ready US Core demographic values from a FHIR Patient resource. */
import type {
  CodeableConcept,
  ContactPoint,
  Extension,
  HumanName,
  Patient,
} from 'fhir/r4'
import {
  formatAddress,
  formatPhone,
  getCodeableConceptText,
  getDisplayNameFromHumanName,
  getFirstMrn,
  placeholderValue,
} from '../../lib/fhir/formatters'

export type EmergencyContact = {
  name: string
  relationship: string
  phone: string
  email: string
  address: string
}

const CONTACT_RELATIONSHIP_CODE_MAP: Record<string, string> = {
  BRO: 'Brother', CHD: 'Child', DAU: 'Daughter', DAUC: 'Daughter',
  DAUINLAW: 'Daughter-in-law', DOMPART: 'Domestic partner', FAMMEMB: 'Family member',
  FTH: 'Father', FRND: 'Friend', GRDFTH: 'Grandfather', GRDMTH: 'Grandmother',
  HUSB: 'Husband', MTH: 'Mother', NBOR: 'Neighbor', NCHILD: 'Natural child',
  NIECE: 'Niece', NEPHEW: 'Nephew', PARN: 'Parent', PRN: 'Parent', SIS: 'Sister',
  SIBC: 'Sibling', SIGOTHR: 'Significant other', SON: 'Son', SONC: 'Son',
  SONINLAW: 'Son-in-law', SPO: 'Spouse', STPCHLD: 'Stepchild', UNCLE: 'Uncle',
  AUNT: 'Aunt', WIFE: 'Wife',
}

const US_CORE_RACE_URL = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race'
const US_CORE_ETHNICITY_URL =
  'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity'
const US_CORE_BIRTHSEX_URL =
  'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex'

export function getLanguage(patient: Patient) {
  const code = patient.communication?.[0]?.language?.coding?.[0]?.code ||
    patient.communication?.[0]?.language?.text
  return code ? code.toUpperCase() : placeholderValue()
}

export function getBirthSex(extensions: Extension[] | undefined) {
  return extensions?.find((item) => item.url === US_CORE_BIRTHSEX_URL)?.valueCode ||
    placeholderValue()
}

export function getUsCoreCategoryDisplay(
  extensions: Extension[] | undefined,
  extensionUrl: string,
) {
  const extension = extensions?.find((item) => item.url === extensionUrl)
  const ombCategory = extension?.extension?.find((item) => item.url === 'ombCategory')
  return ombCategory?.valueCoding?.display || ombCategory?.valueCoding?.code ||
    extension?.valueString || placeholderValue()
}

export function getMaritalStatus(value: CodeableConcept | undefined) {
  const code = value?.coding?.[0]?.code
  const labels: Record<string, string> = {
    M: 'Married', S: 'Never Married', D: 'Divorced', W: 'Widowed',
    U: 'Unmarried', P: 'Polygamous',
  }
  return (code ? labels[code] : undefined) || getCodeableConceptText(value) || placeholderValue()
}

function getEmail(telecom: ContactPoint[] | undefined) {
  return telecom?.find((item) => item.system === 'email')?.value || placeholderValue()
}

function getRelationship(values: CodeableConcept[] | undefined) {
  const concept = values?.[0]
  const coding = concept?.coding?.[0]
  const code = coding?.code?.toUpperCase()
  return (code ? CONTACT_RELATIONSHIP_CODE_MAP[code] : undefined) || coding?.display ||
    concept?.text || coding?.code || 'Unknown'
}

export function getEmergencyContacts(patient: Patient): EmergencyContact[] {
  return patient.contact?.map((contact, index) => ({
    name: contact.name?.text ||
      getDisplayNameFromHumanName(contact.name as HumanName | undefined) ||
      `Contact ${index + 1}`,
    relationship: getRelationship(contact.relationship),
    phone: formatPhone(contact.telecom),
    email: getEmail(contact.telecom),
    address: formatAddress(contact.address),
  })) ?? []
}

export function buildPatientDemographics(patient: Patient) {
  const name = patient.name?.[0]
  const firstName = name?.given?.[0] || placeholderValue()
  const lastName = name?.family || placeholderValue()
  const birthDate = patient.birthDate || placeholderValue()
  const gender = patient.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
    : placeholderValue()
  const mrn = getFirstMrn(patient.identifier) || placeholderValue()

  return {
    patientId: patient.id || '',
    patientName: getDisplayNameFromHumanName(name) || placeholderValue(),
    patientMeta: [gender, `DOB: ${birthDate}`, `MRN: ${mrn}`].join(' · '),
    personalInformation: {
      firstName, lastName, birthDate, gender,
      birthSex: getBirthSex(patient.extension),
      maritalStatus: getMaritalStatus(patient.maritalStatus),
      mrn,
    },
    demographics: {
      race: getUsCoreCategoryDisplay(patient.extension, US_CORE_RACE_URL),
      ethnicity: getUsCoreCategoryDisplay(patient.extension, US_CORE_ETHNICITY_URL),
      language: getLanguage(patient),
    },
    contactInformation: {
      address: formatAddress(patient.address?.[0]),
      phone: formatPhone(patient.telecom),
      email: getEmail(patient.telecom),
    },
    emergencyContacts: getEmergencyContacts(patient),
  }
}
