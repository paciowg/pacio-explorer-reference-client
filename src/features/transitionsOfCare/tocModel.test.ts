/** Verifies TOC discovery, section classification, and readable Bundle interpretation. */
import type { Bundle, Composition, Condition, DocumentReference, Observation, Questionnaire, QuestionnaireResponse } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import {
  buildTocSectionOptions,
  buildTocViewSections,
  getQuestionnaireDisplay,
  getQuestionnaireResponseReferences,
  getTocDocuments,
} from './tocModel'

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

  it('uses the shared DocumentReference display precedence for TOC discovery', () => {
    const documents: Bundle = {
      resourceType: 'Bundle', type: 'collection', entry: [
        { resource: { resourceType: 'DocumentReference', id: 'described', status: 'current', description: 'Discharge to home', type: { text: 'Transfer Summary Note', coding: [{ code: '18761-7' }] }, content: [] } as DocumentReference },
        { resource: { resourceType: 'DocumentReference', id: 'typed', status: 'current', type: { coding: [{ code: '18761-7', display: 'Transfer Summary Note' }] }, content: [] } as DocumentReference },
      ],
    }
    expect(getTocDocuments(documents).map((document) => document.title)).toEqual([
      'Discharge to home', 'Transfer Summary Note',
    ])
  })

  it('sorts dated section resources newest-first and leaves undated resources last in source order', () => {
    const datedBundle: Bundle = {
      resourceType: 'Bundle', type: 'collection', entry: [
        { resource: { resourceType: 'QuestionnaireResponse', id: 'undated-1', status: 'completed', questionnaire: 'Questionnaire/one' } as QuestionnaireResponse },
        { resource: { resourceType: 'QuestionnaireResponse', id: 'older', status: 'completed', authored: '2026-01-01', questionnaire: 'Questionnaire/older' } as QuestionnaireResponse },
        { resource: { resourceType: 'QuestionnaireResponse', id: 'newer', status: 'completed', authored: '2026-03-01', questionnaire: 'Questionnaire/newer' } as QuestionnaireResponse },
        { resource: { resourceType: 'QuestionnaireResponse', id: 'undated-2', status: 'completed', questionnaire: 'Questionnaire/two' } as QuestionnaireResponse },
      ],
    }
    const behavioral = buildTocSectionOptions(datedBundle).find((section) => section.key === 'behavioralHealth')
    expect(behavioral?.options.map((option) => option.resource.id)).toEqual(['newer', 'older', 'undated-1', 'undated-2'])
  })

  it('uses Questionnaire metadata after a response narrative and before its raw canonical', () => {
    const response: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse', id: 'qr-1', status: 'completed', questionnaire: 'Questionnaire/gad-7',
    }
    const narratedResponse: QuestionnaireResponse = {
      ...response,
      id: 'qr-2',
      text: { status: 'generated', div: '<div>GAD-7 score: 12</div>' },
    }
    const responses: Bundle = {
      resourceType: 'Bundle', type: 'collection', entry: [{ resource: response }, { resource: narratedResponse }],
    }
    const labels = new Map([['Questionnaire/gad-7', 'Generalized Anxiety Disorder 7-item scale']])

    expect(buildTocSectionOptions(responses, labels).find((section) => section.key === 'behavioralHealth')?.options
      .map((option) => option.title)).toEqual(['Generalized Anxiety Disorder 7-item scale', 'GAD-7 score: 12'])
    expect(getQuestionnaireResponseReferences(responses)).toEqual(['Questionnaire/gad-7'])
  })

  it('uses Questionnaire title then the first coding display, without exposing coding values', () => {
    const titled: Questionnaire = {
      resourceType: 'Questionnaire', status: 'active', title: 'Falls Risk Assessment', code: [{ code: 'fall-risk', display: 'Falls assessment' }],
    }
    const coded: Questionnaire = {
      resourceType: 'Questionnaire', status: 'active', code: [{ code: 'no-display' }, { code: 'gad-7', display: 'GAD-7' }],
    }
    expect(getQuestionnaireDisplay(titled)).toBe('Falls Risk Assessment')
    expect(getQuestionnaireDisplay(coded)).toBe('GAD-7')
  })

  it('resolves Composition section entries and derives structural display summaries', () => {
    const documentBundle: Bundle = { ...bundle, type: 'document', entry: [
      { fullUrl: 'urn:uuid:composition', resource: { resourceType: 'Composition', status: 'final', type: { text: 'Transfer Summary Note' }, date: '2026-01-01', author: [], title: 'Transfer Summary', section: [{ title: 'Problems', text: { status: 'generated', div: '<div><p>Selected problems</p></div>' }, entry: [{ reference: 'urn:uuid:condition' }] }, { title: 'Allergies', text: { status: 'generated', div: '<div><p>No known allergies</p></div>' }, emptyReason: { coding: [{ code: 'unavailable' }] } }] } as Composition },
      { fullUrl: 'urn:uuid:condition', resource: bundle.entry?.[2].resource },
    ] }
    const model = buildTocViewSections(documentBundle, 'https://example.test/fhir')
    expect(model?.sections[0].summary).toBe('1 entry')
    expect(model?.sections[0].entries[0].title).toBe('Diabetes')
    expect(model?.sections[1].summary).toBe('No entries — unavailable')
  })
})
