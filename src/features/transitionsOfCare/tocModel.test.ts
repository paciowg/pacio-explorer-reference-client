/** Verifies TOC discovery, section classification, and readable Bundle interpretation. */
import type { Bundle, Composition, Condition, DocumentReference, Observation } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { buildTocSectionOptions, buildTocViewSections, getTocDocuments } from './tocModel'

const bundle: Bundle = {
  resourceType: 'Bundle', type: 'collection', entry: [
    { resource: { resourceType: 'DocumentReference', id: 'toc-1', status: 'current', date: '2026-01-01', type: { coding: [{ system: 'http://loinc.org', code: '18761-7' }] }, content: [] } as DocumentReference },
    { resource: { resourceType: 'Observation', id: 'vital-1', status: 'final', category: [{ coding: [{ code: 'vital-signs' }] }], code: { text: 'Heart rate' }, subject: { reference: 'Patient/patient-1' } } as Observation },
    { resource: { resourceType: 'Condition', id: 'condition-1', subject: { reference: 'Patient/patient-1' }, code: { text: 'Diabetes' } } as Condition },
  ],
}

describe('TOC models', () => {
  it('discovers indexed TOC documents and classifies clinical resources', () => {
    expect(getTocDocuments(bundle).map((item) => item.id)).toEqual(['toc-1'])
    const sections = buildTocSectionOptions(bundle)
    expect(sections.find((section) => section.key === 'vitalSigns')?.options[0].reference).toBe('Observation/vital-1')
    expect(sections.find((section) => section.key === 'problems')?.options[0].reference).toBe('Condition/condition-1')
  })

  it('resolves and summarizes Composition section entries', () => {
    const documentBundle: Bundle = { ...bundle, type: 'document', entry: [
      { fullUrl: 'urn:uuid:composition', resource: { resourceType: 'Composition', status: 'final', type: { text: 'Transfer Summary Note' }, date: '2026-01-01', author: [], title: 'Transfer Summary', section: [{ title: 'Problems', text: { status: 'generated', div: '<div><p>Selected problems</p></div>' }, entry: [{ reference: 'urn:uuid:condition' }] }] } as Composition },
      { fullUrl: 'urn:uuid:condition', resource: bundle.entry?.[2].resource },
    ] }
    const model = buildTocViewSections(documentBundle, 'https://example.test/fhir')
    expect(model?.sections[0].narrative).toBe('Selected problems')
    expect(model?.sections[0].entries[0].title).toBe('Diabetes')
  })
})
