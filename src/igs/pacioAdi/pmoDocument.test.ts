import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Composition } from 'fhir/r4'
import { buildAdiPmoBundle } from './pmoDocument'
import { buildAdiDocumentReference } from './documentReference'
import {
  FIXED_CREATED_AT,
  preRefactorAdiPmoInput,
  preRefactorDocumentReferenceInput,
} from '../../test/fixtures/adiPmoFixture'

afterEach(() => vi.unstubAllGlobals())

describe('pre-refactor ADI PMO builders', () => {
  it('builds the representative PMO Bundle with its existing profiles, narratives, entries, and references', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('unused-uuid') })

    const bundle = buildAdiPmoBundle({
      ...preRefactorAdiPmoInput,
      documentIdentifier: {
        system: 'https://pacioproject.org/adi-document-identifier', value: 'composition-uuid',
      },
      compositionFullUrl: 'urn:uuid:composition-uuid',
    })
    const [compositionEntry, binaryEntry, patientEntry, roleEntry, practitionerEntry] = bundle.entry ?? []
    const composition = compositionEntry.resource as Composition

    expect(bundle).toMatchObject({ resourceType: 'Bundle', type: 'document', timestamp: FIXED_CREATED_AT })
    expect(bundle.entry).toHaveLength(5)
    expect(compositionEntry.fullUrl).toBe('urn:uuid:composition-uuid')
    expect(composition?.resourceType).toBe('Composition')
    expect(composition?.meta?.profile).toEqual([
      'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-PMOComposition',
    ])
    expect(composition?.identifier).toEqual({
      system: 'https://pacioproject.org/adi-document-identifier', value: 'composition-uuid',
    })
    expect(composition?.extension).toEqual([
      {
        url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-docVersionNumber-extension',
        valueString: '20250102030405',
      },
      {
        url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-dataEnterer-extension',
        valueReference: { reference: 'RelatedPerson/enterer-1', display: 'Dana Enterer' },
      },
    ])
    expect(composition?.text?.div).toContain('ADI Portable Medical Order for Ada Lovelace.')
    expect(composition?.text?.div).toContain('Facilitator: Fran Facilitator')
    expect(composition?.section?.map((section) => section.title)).toEqual([
      'Advance directive source form', 'Portable Medical Orders',
    ])
    expect(composition?.section?.[0]?.entry).toEqual([{ reference: 'Binary/source-form-binary' }])
    expect(composition?.author).toEqual([
      { reference: 'PractitionerRole/role-1', display: 'Dr. Grace Hopper — Physician' },
    ])
    expect(composition?.attester).toEqual([
      { mode: 'legal', time: '2025-01-01T00:00:00.000Z', party: { reference: 'RelatedPerson/attester-1', display: 'Alex Attester' } },
    ])
    expect(composition?.event?.[0]?.detail).toEqual([
      { reference: 'PractitionerRole/facilitator-1', display: 'Fran Facilitator' },
    ])
    expect(binaryEntry).toMatchObject({
      fullUrl: 'Binary/source-form-binary',
      resource: {
        resourceType: 'Binary', id: 'source-form-binary', contentType: 'application/pdf', data: 'JVBERi0xLjQ=',
        meta: { profile: ['http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-ADISourceFormInformation'] },
      },
    })
    expect([patientEntry.fullUrl, roleEntry.fullUrl, practitionerEntry.fullUrl]).toEqual([
      'Patient/patient-1', 'PractitionerRole/role-1', 'Practitioner/practitioner-1',
    ])
  })

  it('builds the representative server DocumentReference with its ADI metadata', () => {
    const documentReference = buildAdiDocumentReference({
      subject: preRefactorDocumentReferenceInput.subject,
      author: preRefactorDocumentReferenceInput.author,
      authenticator: preRefactorDocumentReferenceInput.authenticator,
      custodian: preRefactorDocumentReferenceInput.custodian,
      status: preRefactorDocumentReferenceInput.docStatus,
      signedDate: preRefactorDocumentReferenceInput.authenticationTime,
      createdAt: preRefactorDocumentReferenceInput.createdAt,
      jurisdiction: preRefactorDocumentReferenceInput.jurisdiction,
      contextPeriod: preRefactorDocumentReferenceInput.contextPeriod,
      bundleUrl: preRefactorDocumentReferenceInput.contentUrl,
      documentIdentifier: preRefactorDocumentReferenceInput.masterIdentifier,
      setIdentifier: preRefactorDocumentReferenceInput.identifier[0],
    })

    expect(documentReference.meta?.profile).toEqual(preRefactorDocumentReferenceInput.profileUrls)
    expect(documentReference.status).toBe('current')
    expect(documentReference.docStatus).toBe('final')
    expect(documentReference.type).toEqual(preRefactorDocumentReferenceInput.type)
    expect(documentReference.category).toEqual(preRefactorDocumentReferenceInput.category)
    expect(documentReference.subject).toEqual(preRefactorDocumentReferenceInput.subject)
    expect(documentReference.author).toEqual(preRefactorDocumentReferenceInput.author)
    expect(documentReference.authenticator).toEqual(preRefactorDocumentReferenceInput.authenticator)
    expect(documentReference.custodian).toEqual(preRefactorDocumentReferenceInput.custodian)
    expect(documentReference.identifier).toEqual(preRefactorDocumentReferenceInput.identifier)
    expect(documentReference.masterIdentifier).toEqual(preRefactorDocumentReferenceInput.masterIdentifier)
    expect(documentReference.date).toBe(FIXED_CREATED_AT)
    expect(documentReference.description).toBe('Ada Lovelace ADI POLST PMO Document')
    expect(documentReference.context?.period).toEqual(preRefactorDocumentReferenceInput.contextPeriod)
    expect(documentReference.content).toEqual([{
      attachment: {
        contentType: 'application/fhir+json', url: 'https://example.test/fhir/Bundle/bundle-1', creation: FIXED_CREATED_AT,
      },
    }])
    expect(documentReference.extension).toEqual([
      { url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-authentication-time', valueDateTime: '2025-01-01T00:00:00.000Z' },
      { url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-docVersionNumber-extension', valueString: '20250102030405' },
      { url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-jurisdiction-extension', valueCodeableConcept: preRefactorDocumentReferenceInput.jurisdiction },
    ])
  })
})
