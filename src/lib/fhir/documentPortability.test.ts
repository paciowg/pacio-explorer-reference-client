/** Verifies portable Patient relationships and captured reference conversion without dropping unfamiliar dependencies. */
import type { Bundle, Composition, Patient, Practitioner } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { portableCapturedBundle, portableDocumentPatient } from './documentPortability'

describe('standalone document Patient copies', () => {
  it('omits source relationships and storage metadata while retaining demographics and valid contained relationships', () => {
    const patient: Patient = {
      resourceType: 'Patient', id: 'p', meta: { versionId: '3', profile: ['urn:profile'] }, name: [{ text: 'Pat Example' }],
      identifier: [{ system: 'urn:mrn', value: '123' }], birthDate: '1970-01-01',
      managingOrganization: { reference: 'https://source.test/fhir/Organization/org' },
      generalPractitioner: [{ reference: 'PractitionerRole/role' }, { reference: '#practitioner' }],
      contained: [{ resourceType: 'Practitioner', id: 'practitioner', name: [{ text: 'Captured practitioner' }] } as Practitioner],
      link: [{ other: { reference: 'Patient/old' }, type: 'seealso' }],
      contact: [{ organization: { reference: 'Organization/org' } }, { name: { text: 'Emergency contact' }, organization: { reference: 'Organization/org' } }],
    }
    const before = structuredClone(patient)
    expect(portableDocumentPatient(patient)).toEqual({
      resourceType: 'Patient', name: patient.name, identifier: patient.identifier, birthDate: patient.birthDate,
      contained: patient.contained, generalPractitioner: [{ reference: '#practitioner' }], contact: [{ name: { text: 'Emergency contact' } }],
    })
    expect(patient).toEqual(before)
  })

  it('rejects unfamiliar reference extensions and broken contained references instead of silently dropping them', () => {
    expect(() => portableDocumentPatient({ resourceType: 'Patient', extension: [{ url: 'urn:custom', valueReference: { reference: 'Organization/org' } }] })).toThrow('Unsupported destination Patient reference')
    expect(() => portableDocumentPatient({ resourceType: 'Patient', managingOrganization: { reference: '#missing' } })).toThrow('Unsupported destination Patient reference')
  })
})

describe('captured Bundle portability', () => {
  const source = 'https://source.test/fhir'
  function fixture(): Bundle {
    return { resourceType: 'Bundle', type: 'document', entry: [
      { fullUrl: `${source}/Composition/doc`, resource: {
        resourceType: 'Composition', id: 'doc', status: 'final', type: { text: 'Captured document' }, title: 'Snapshot', date: '2026-01-01',
        subject: { reference: `${source}/Patient/p/_history/2` }, author: [{ reference: 'Patient/p' }],
      } as Composition },
      { fullUrl: `${source}/Patient/p`, resource: { resourceType: 'Patient', id: 'p', meta: { versionId: '2' } } },
    ] }
  }
  it('rewrites same-server absolute, relative, and matching historical references and is stable on subsequent preparation', () => {
    const bundle = fixture()
    const before = structuredClone(bundle)
    const portable = portableCapturedBundle(bundle, source)
    const composition = portable.entry![0].resource as Composition
    expect(composition.subject?.reference).toBe(portable.entry![1].fullUrl)
    expect(composition.author[0].reference).toBe(portable.entry![1].fullUrl)
    expect(portableCapturedBundle(portable, source)).toEqual(portable)
    expect(bundle).toEqual(before)
  })
  it('rejects unavailable historical versions and unresolved external resource references', () => {
    const bundle = fixture()
    ;(bundle.entry![0].resource as Composition).subject!.reference = `${source}/Patient/p/_history/1`
    expect(() => portableCapturedBundle(bundle, source)).toThrow('Unresolved captured reference')
    ;(bundle.entry![0].resource as Composition).subject!.reference = 'https://external.test/Patient/p'
    expect(() => portableCapturedBundle(bundle, source)).toThrow('Unresolved captured reference')
  })
})
