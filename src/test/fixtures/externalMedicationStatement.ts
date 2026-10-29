/** Supplies an externally authored statement with content beyond Explorer's editable subset for preservation tests. */
import type { Medication, MedicationStatement } from 'fhir/r4'
import { SMP_ADHERENCE } from '../../igs/pacioSmp/medicationStatement'

export const externalMedicationStatement: MedicationStatement = {
  resourceType: 'MedicationStatement', id: 'external-statement', status: 'active',
  meta: { profile: ['https://example.test/StructureDefinition/external-statement'], versionId: 'older-demo-version',
    lastUpdated: '2026-01-03T13:00:00Z', security: [{ system: 'urn:example:security', code: 'restricted' }] },
  text: { status: 'additional', div: '<div xmlns="http://www.w3.org/1999/xhtml">Original authored narrative.</div>' },
  identifier: [{ system: 'urn:external:identifier', value: 'original-id' }],
  subject: { reference: 'https://source.test/fhir/Patient/p/_history/2', display: 'Pat Example' },
  contained: [{ resourceType: 'Medication', id: 'contained-medication', code: { text: 'Externally compounded medication' } } as Medication],
  medicationReference: { reference: '#contained-medication' },
  dateAsserted: '2021-03', effectivePeriod: { start: '2021-01-02T10:00:00-05:00', end: '2026-02' },
  informationSource: { reference: 'PractitionerRole/role', display: 'Original information source' },
  basedOn: [{ reference: 'MedicationRequest/r/_history/3', display: 'Historical request' }, { reference: 'MedicationRequest/second' }],
  partOf: [{ reference: 'MedicationDispense/d' }], derivedFrom: [{ reference: 'DocumentReference/source' }],
  context: { reference: 'EpisodeOfCare/e', display: 'Original episode' },
  reasonCode: [{ coding: [{ system: 'urn:external:reason', code: 'condition', display: 'Original indication' }] }],
  statusReason: [{ text: 'Original status reason' }],
  category: { coding: [{ system: 'urn:external:category', code: 'custom', display: 'Custom category' }] },
  extension: [{ url: 'https://example.test/unrelated', valueString: 'Preserve this' },
    { url: SMP_ADHERENCE, id: 'original-adherence', extension: [
      { url: 'code', id: 'original-code', valueCodeableConcept: { text: 'Patient reports taking', coding: [
        { system: 'http://hl7.org/fhir/CodeSystem/medication-statement-adherence', code: 'taking', display: 'Taking' },
        { system: 'urn:external:mapping', code: 'T' },
      ] } },
      { url: 'reason', id: 'original-reason', valueCodeableConcept: { coding: [{ system: 'urn:external:reason', code: 'instructions', display: 'Following original instructions' }] } },
      { url: 'https://example.test/adherence-detail', valueBoolean: true },
    ] }],
  modifierExtension: [{ url: 'https://example.test/modifier', valueString: 'Preserved without interpretation in this demo' }],
  dosage: [{ sequence: 2, text: 'Complex original instructions', timing: { repeat: { dayOfWeek: ['mon', 'fri'], timeOfDay: ['08:30:45'], boundsPeriod: { start: '2021-01-02T10:00:00-05:00' } } },
    doseAndRate: [{ doseRange: { low: { value: 1 }, high: { value: 2 } }, rateRatio: { numerator: { value: 2 }, denominator: { value: 3 } } }],
    extension: [{ url: 'https://example.test/dosage-detail', valueString: 'Preserve dosage' }], maxDosePerLifetime: { value: 99, unit: 'mg' } }],
  note: [{ text: 'Original clinician note', authorReference: { reference: 'Practitioner/author', display: 'Original author' }, time: '2021-03-02T11:00:00Z' },
    { text: 'Another original note', authorString: 'Outside system', time: '2022-01-01' }],
}
