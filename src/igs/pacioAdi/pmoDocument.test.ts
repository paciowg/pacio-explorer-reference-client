/** Verifies the PACIO ADI PMO document Bundle shape and optional participant mappings. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Composition } from 'fhir/r4'
import { buildAdiPmoBundle } from './pmoDocument'
import { buildAdiDocumentReference } from './documentReference'
import {
  FIXED_CREATED_AT,
  representativeAdiDocumentReference,
  representativeAdiPmoBundle,
  representativeAdiPmoInput,
  representativeDocumentReferenceInput,
} from '../../test/fixtures/adiPmoFixture'

afterEach(() => vi.unstubAllGlobals())

describe('ADI PMO builders', () => {
  it('builds the representative PMO Bundle with its intended profiles, narratives, entries, and references', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('unused-uuid') })

    const bundle = buildAdiPmoBundle({
      ...representativeAdiPmoInput,
      documentIdentifierValue: representativeDocumentReferenceInput.masterIdentifier.value!,
      compositionFullUrl: 'urn:uuid:composition-uuid',
    })
    const [compositionEntry, binaryEntry, patientEntry, roleEntry, practitionerEntry] = bundle.entry ?? []
    const composition = compositionEntry.resource as Composition

    expect(bundle).toEqual(representativeAdiPmoBundle)

    expect(bundle).toMatchObject({ resourceType: 'Bundle', type: 'document', timestamp: FIXED_CREATED_AT })
    expect(bundle.entry).toHaveLength(5)
    expect(compositionEntry.fullUrl).toBe('urn:uuid:composition-uuid')
    expect(composition?.resourceType).toBe('Composition')
    expect(composition?.meta?.profile).toEqual([
      'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-PMOComposition',
    ])
    expect(composition?.identifier).toEqual({
      system: 'https://pacioproject.org/adi-document-identifier', value: 'document-1',
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
      subject: representativeDocumentReferenceInput.subject,
      author: representativeDocumentReferenceInput.author,
      authenticator: representativeDocumentReferenceInput.authenticator,
      custodian: representativeDocumentReferenceInput.custodian,
      status: representativeDocumentReferenceInput.docStatus,
      signedDate: representativeDocumentReferenceInput.authenticationTime,
      createdAt: representativeDocumentReferenceInput.createdAt,
      jurisdiction: representativeDocumentReferenceInput.jurisdiction,
      contextPeriod: representativeDocumentReferenceInput.contextPeriod,
      bundleUrl: representativeDocumentReferenceInput.contentUrl,
      documentIdentifierValue: representativeDocumentReferenceInput.masterIdentifier.value!,
      setIdentifierValue: representativeDocumentReferenceInput.identifier[0].value!,
    })

    expect(documentReference).toEqual(representativeAdiDocumentReference)

    expect(documentReference.meta?.profile).toEqual(representativeDocumentReferenceInput.profileUrls)
    expect(documentReference.status).toBe('current')
    expect(documentReference.docStatus).toBe('final')
    expect(documentReference.type).toEqual(representativeDocumentReferenceInput.type)
    expect(documentReference.category).toEqual(representativeDocumentReferenceInput.category)
    expect(documentReference.subject).toEqual(representativeDocumentReferenceInput.subject)
    expect(documentReference.author).toEqual(representativeDocumentReferenceInput.author)
    expect(documentReference.authenticator).toEqual(representativeDocumentReferenceInput.authenticator)
    expect(documentReference.custodian).toEqual(representativeDocumentReferenceInput.custodian)
    expect(documentReference.identifier).toEqual(representativeDocumentReferenceInput.identifier)
    expect(documentReference.masterIdentifier).toEqual(representativeDocumentReferenceInput.masterIdentifier)
    expect(documentReference.date).toBe(FIXED_CREATED_AT)
    expect(documentReference.description).toBe('Ada Lovelace ADI POLST PMO Document')
    expect(documentReference.context?.period).toEqual(representativeDocumentReferenceInput.contextPeriod)
    expect(documentReference.content).toEqual([{
      attachment: {
        contentType: 'application/fhir+json', url: 'https://example.test/fhir/Bundle/bundle-1', creation: FIXED_CREATED_AT,
      },
    }])
    expect(documentReference.extension).toEqual([
      { url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-authentication-time', valueDateTime: '2025-01-01T00:00:00.000Z' },
      { url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-docVersionNumber-extension', valueString: '20250102030405' },
      { url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-jurisdiction-extension', valueCodeableConcept: representativeDocumentReferenceInput.jurisdiction },
    ])
  })
})
