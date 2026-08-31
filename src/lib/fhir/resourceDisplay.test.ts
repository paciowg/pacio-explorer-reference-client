/** Verifies simple resource labels use clinically useful fields before technical identifiers. */
import type { DeviceRequest, Observation, QuestionnaireResponse, Resource } from 'fhir/r4'
import { describe, expect, it } from 'vitest'
import { getSimpleResourceDisplay } from './resourceDisplay'

describe('getSimpleResourceDisplay', () => {
  it('uses generated QuestionnaireResponse narrative before its canonical URI', () => {
    const response: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse', id: 'qr-1', status: 'completed', questionnaire: 'https://example.test/Questionnaire/promis',
      text: { status: 'generated', div: '<div><p>PROMIS Pain Interference (CAT) - March 2026. T-score: 69.3.</p></div>' },
    }
    expect(getSimpleResourceDisplay(response)).toBe('PROMIS Pain Interference (CAT) - March 2026. T-score: 69.3.')
    expect(getSimpleResourceDisplay({ ...response, text: undefined } as QuestionnaireResponse)).toBe('https://example.test/Questionnaire/promis')
  })

  it('uses DeviceRequest code concepts and reference displays before its id', () => {
    const request: DeviceRequest = {
      resourceType: 'DeviceRequest', id: 'wheelchair', status: 'active', intent: 'order', subject: { reference: 'Patient/1' },
      codeCodeableConcept: { coding: [{ system: 'http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets', code: 'K0001', display: 'Standard wheelchair' }] },
    }
    expect(getSimpleResourceDisplay(request)).toBe('Standard wheelchair')
    expect(getSimpleResourceDisplay({ ...request, codeCodeableConcept: undefined, codeReference: { reference: 'Device/example', display: 'Configured wheelchair' } } as DeviceRequest)).toBe('Configured wheelchair')
  })

  it('uses a later Observation coding display and retains a technical fallback', () => {
    const observation: Observation = {
      resourceType: 'Observation', id: 'oxygen', status: 'final', code: { coding: [{ code: '59408-5' }, { code: '2708-6', display: 'Oxygen saturation in Arterial blood' }] },
    }
    expect(getSimpleResourceDisplay(observation)).toBe('Oxygen saturation in Arterial blood')
    expect(getSimpleResourceDisplay({ resourceType: 'Basic', id: 'basic-1' } as Resource)).toBe('Basic/basic-1')
  })
})
