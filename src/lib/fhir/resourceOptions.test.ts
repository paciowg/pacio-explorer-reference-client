/** Verifies shared practitioner choice matching and labels for mixed and role-only reference fields. */
import { describe, expect, it } from 'vitest'
import { formatResourceSelectionLabel, getPractitionerChoices, getResourceReferenceChoices, getResourceSelectionDisplay, getRolePreferredReferenceOptions } from './resourceOptions'

describe('shared practitioner choices', () => {
  it.each([
    [{ resourceType: 'Patient' as const, id: 'p', name: [{ text: 'Betsy Johnson' }] }, 'Patient: Betsy Johnson'],
    [{ resourceType: 'Practitioner' as const, id: 'pr', name: [{ text: 'Anita Chu' }] }, 'Practitioner: Anita Chu'],
    [{ resourceType: 'Organization' as const, id: 'org', name: 'Clinic: East' }, 'Organization: Clinic: East'],
    [{ resourceType: 'RelatedPerson' as const, id: 'rp', patient: { reference: 'Patient/p' }, name: [{ text: 'Charles Johnson' }], relationship: [{ text: 'son' }] }, 'RelatedPerson: Charles Johnson — son'],
    [{ resourceType: 'RelatedPerson' as const, id: 'rp', patient: { reference: 'Patient/p' }, name: [{ text: 'Charles Johnson' }] }, 'RelatedPerson: Charles Johnson'],
    [{ resourceType: 'Patient' as const, id: 'unnamed' }, 'Patient: unnamed'],
  ])('formats type-first selection labels %#', (resource, label) => {
    expect(formatResourceSelectionLabel(resource.resourceType, getResourceSelectionDisplay(resource))).toBe(label)
  })
  it('uses supported types to distinguish mixed and single-type choices without changing display text', () => {
    const options = getRolePreferredReferenceOptions(new Map([
      ['Organization/org', { resourceType: 'Organization', id: 'org', name: 'Clinic: East' } as import('fhir/r4').Organization],
    ]), 'https://source.test/fhir')
    expect(getResourceReferenceChoices(options, ['Organization'])).toEqual([{ value: 'Organization/org', label: 'Clinic: East' }])
    expect(getResourceReferenceChoices(options, ['Organization', 'PractitionerRole'])).toEqual([{ value: 'Organization/org', label: 'Organization: Clinic: East' }])
    expect(options[0].display).toBe('Clinic: East')
  })
  it.each([
    'Practitioner/paired',
    'Practitioner/paired/_history/2',
    'https://source.test/fhir/Practitioner/paired',
    'https://source.test/fhir/Practitioner/paired/_history/2',
  ])('resolves %s for labels and suppresses the paired practitioner', (reference) => {
    const bundle = { resourceType: 'Bundle' as const, type: 'collection' as const, entry: [
      { resource: { resourceType: 'Practitioner' as const, id: 'paired', name: [{ text: 'Alex Smith' }] } },
      { resource: { resourceType: 'PractitionerRole' as const, id: 'role', practitioner: { reference }, code: [{ text: 'Physician' }] } },
    ] }
    const choices = getPractitionerChoices(bundle, 'https://source.test/fhir')
    expect(choices.roleOptions[0].label).toBe('Alex Smith — Physician')
    expect(choices.practitionerByReference.get(reference)?.id).toBe('paired')
    expect(choices.unpairedPractitioners.size).toBe(0)
  })

  it('retains unresolved and external roles without suppressing local practitioners', () => {
    const bundle = { resourceType: 'Bundle' as const, type: 'collection' as const, entry: [
      { resource: { resourceType: 'Practitioner' as const, id: 'local', name: [{ text: 'Alex Smith' }] } },
      { resource: { resourceType: 'PractitionerRole' as const, id: 'external', practitioner: { reference: 'https://other.test/fhir/Practitioner/local' }, code: [{ text: 'External clinician' }] } },
      { resource: { resourceType: 'PractitionerRole' as const, id: 'unresolved', practitioner: { reference: 'Practitioner/missing' }, code: [{ text: 'Specialist' }] } },
      { resource: { resourceType: 'PractitionerRole' as const, practitioner: { reference: 'Practitioner/local' } } },
    ] }
    const choices = getPractitionerChoices(bundle, 'https://source.test/fhir')
    expect(choices.roleOptions.map((option) => option.value)).toEqual(['external', 'unresolved'])
    expect([...choices.unpairedPractitioners.keys()]).toEqual(['Practitioner/local'])
    expect(choices.practitionerByReference.has('https://other.test/fhir/Practitioner/local')).toBe(false)
  })
})
