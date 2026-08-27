import { describe, expect, it } from 'vitest'
import { readAdiDocument } from './adiDocument'

describe('readAdiDocument', () => {
  it('returns null for generic DocumentReference resources', () => {
    expect(readAdiDocument(
      { resourceType: 'Composition', status: 'final', type: { text: 'Other' }, date: '2025-01-01', title: 'Other', author: [] },
      { resourceType: 'DocumentReference', status: 'current', content: [] },
    )).toBeNull()
  })

  it('extracts PACIO ADI version, data enterer, and facilitators', () => {
    const model = readAdiDocument(
      {
        resourceType: 'Composition', status: 'final', type: { text: 'PMO' }, date: '2025-01-01', title: 'PMO', author: [],
        meta: { profile: ['http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-PMOComposition'] },
        extension: [{ url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-docVersionNumber-extension', valueString: '20250101000000' }, { url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-dataEnterer-extension', valueReference: { reference: 'Patient/patient-1' } }],
        event: [{ code: [{ coding: [{ code: 'acp-services' }] }], detail: [{ reference: 'PractitionerRole/facilitator-1' }] }],
      },
      { resourceType: 'DocumentReference', status: 'current', content: [] },
    )
    expect(model).toEqual({ versionNumber: '20250101000000', dataEnterer: { reference: 'Patient/patient-1' }, facilitators: [{ reference: 'PractitionerRole/facilitator-1' }] })
  })
})
