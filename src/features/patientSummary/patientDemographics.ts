import type { CodeableConcept, ContactPoint, Extension, HumanName, Patient } from 'fhir/r4'
import { formatAddress, formatPhone, getCodeableConceptText, getDisplayNameFromHumanName, getFirstMrn, placeholderValue } from '../../lib/fhir/formatters'

export type EmergencyContact = { name: string; relationship: string; phone: string; email: string; address: string }

const relationshipLabels: Record<string, string> = { BRO: 'Brother', CHD: 'Child', DAU: 'Daughter', DAUC: 'Daughter', DAUINLAW: 'Daughter-in-law', DOMPART: 'Domestic partner', FAMMEMB: 'Family member', FTH: 'Father', FRND: 'Friend', GRDFTH: 'Grandfather', GRDMTH: 'Grandmother', HUSB: 'Husband', MTH: 'Mother', NBOR: 'Neighbor', NCHILD: 'Natural child', NIECE: 'Niece', NEPHEW: 'Nephew', PARN: 'Parent', PRN: 'Parent', SIS: 'Sister', SIBC: 'Sibling', SIGOTHR: 'Significant other', SON: 'Son', SONC: 'Son', SONINLAW: 'Son-in-law', SPO: 'Spouse', STPCHLD: 'Stepchild', UNCLE: 'Uncle', AUNT: 'Aunt', WIFE: 'Wife' }
const raceUrl = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race'
const ethnicityUrl = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity'
const birthSexUrl = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex'

function email(telecom: ContactPoint[] | undefined) { return telecom?.find((item) => item.system === 'email')?.value || placeholderValue() }
function category(extensions: Extension[] | undefined, url: string) {
  const extension = extensions?.find((item) => item.url === url)
  return extension?.extension?.find((item) => item.url === 'ombCategory')?.valueCoding?.display || extension?.extension?.find((item) => item.url === 'ombCategory')?.valueCoding?.code || extension?.valueString || placeholderValue()
}
function maritalStatus(value: CodeableConcept | undefined) {
  const labels: Record<string, string> = { M: 'Married', S: 'Never Married', D: 'Divorced', W: 'Widowed', U: 'Unmarried', P: 'Polygamous' }
  return (value?.coding?.[0]?.code ? labels[value.coding[0].code!] : undefined) || getCodeableConceptText(value) || placeholderValue()
}
function relationship(values: CodeableConcept[] | undefined) {
  const concept = values?.[0]; const coding = concept?.coding?.[0]; const code = coding?.code?.toUpperCase()
  return (code ? relationshipLabels[code] : undefined) || coding?.display || concept?.text || coding?.code || 'Unknown'
}

export function buildPatientDemographics(patient: Patient) {
  const name = patient.name?.[0]; const firstName = name?.given?.[0] || placeholderValue(); const lastName = name?.family || placeholderValue()
  const birthDate = patient.birthDate || placeholderValue(); const gender = patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : placeholderValue(); const mrn = getFirstMrn(patient.identifier) || placeholderValue()
  return {
    patientId: patient.id || '', patientName: getDisplayNameFromHumanName(name) || placeholderValue(), patientMeta: [gender, `DOB: ${birthDate}`, `MRN: ${mrn}`].join(' · '),
    personalInformation: { firstName, lastName, birthDate, gender, birthSex: extensionsBirthSex(patient.extension), maritalStatus: maritalStatus(patient.maritalStatus), mrn },
    demographics: { race: category(patient.extension, raceUrl), ethnicity: category(patient.extension, ethnicityUrl), language: (patient.communication?.[0]?.language?.coding?.[0]?.code || patient.communication?.[0]?.language?.text || '').toUpperCase() || placeholderValue() },
    contactInformation: { address: formatAddress(patient.address?.[0]), phone: formatPhone(patient.telecom), email: email(patient.telecom) },
    emergencyContacts: patient.contact?.map((contact, index) => ({ name: contact.name?.text || getDisplayNameFromHumanName(contact.name as HumanName | undefined) || `Contact ${index + 1}`, relationship: relationship(contact.relationship), phone: formatPhone(contact.telecom), email: email(contact.telecom), address: formatAddress(contact.address) })) ?? [],
  }
}
function extensionsBirthSex(extensions: Extension[] | undefined) { return extensions?.find((item) => item.url === birthSexUrl)?.valueCode || placeholderValue() }
