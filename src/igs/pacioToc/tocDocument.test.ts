/** Verifies PACIO TOC Bundle, Composition, section, and DocumentReference construction. */
import type { Composition, Patient } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { buildTocBundle, buildTocDocumentReference, TOC_SECTION_DEFINITIONS } from './tocDocument'

const patient: Patient = { resourceType: 'Patient', id: 'patient-1', name: [{ text: 'Ada Lovelace' }] }
const identifier = { system: 'urn:ietf:rfc:3986', value: 'urn:uuid:document-1' }

describe('PACIO TOC builders', () => {
  it('builds all required sections and includes selected resources', () => {
    const bundle = buildTocBundle({
      patient, title: 'Transfer Summary for Ada Lovelace', status: 'final', createdAt: '2026-01-02T03:04:05Z',
      author: { reference: 'PractitionerRole/role-1' }, custodian: { reference: 'Organization/org-1' },
      compositionIdentifier: identifier, bundleIdentifier: { ...identifier, value: 'urn:uuid:bundle-1' }, compositionFullUrl: 'urn:uuid:composition-1',
      sections: TOC_SECTION_DEFINITIONS.map((definition) => ({
        key: definition.key, emptyReason: 'unavailable',
        entries: definition.key === 'problems' ? [{ resourceType: 'Condition', id: 'condition-1', subject: { reference: 'Patient/patient-1' }, code: { text: 'Diabetes' } }] : [],
      })),
    })
    const composition = bundle.entry?.[0].resource as Composition | undefined
    expect(bundle.meta?.profile?.[0]).toContain('TOC-Bundle')
    expect(bundle.identifier?.value).toBe('urn:uuid:bundle-1')
    expect(composition?.resourceType).toBe('Composition')
    if (!composition) throw new Error('Missing Composition')
    expect(composition.section).toHaveLength(15)
    expect(composition.section?.find((section) => section.code?.coding?.[0].code === '11450-4')?.entry?.[0].reference).toBe('Condition/condition-1')
    expect(composition.section?.find((section) => section.code?.coding?.[0].code === '48765-2')?.emptyReason?.coding?.[0].code).toBe('unavailable')
  })

  it('builds the companion indexed document', () => {
    const document = buildTocDocumentReference({
      subject: { reference: 'Patient/patient-1' }, author: { reference: 'PractitionerRole/role-1' },
      custodian: { reference: 'Organization/org-1' }, status: 'amended', createdAt: '2026-01-02T03:04:05Z',
      title: 'Transfer Summary', bundleUrl: 'https://example.test/fhir/Bundle/1', documentIdentifier: identifier,
      setIdentifier: { ...identifier, value: 'urn:uuid:set-1' },
    })
    expect(document.meta?.profile?.[0]).toContain('TOC-DocumentReference')
    expect(document.type?.coding?.[0].code).toBe('18761-7')
    expect(document.docStatus).toBe('amended')
    expect(document.masterIdentifier).toEqual(identifier)
    expect(document.content[0].attachment.url).toContain('/Bundle/1')
  })
})
