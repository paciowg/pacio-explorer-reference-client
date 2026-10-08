/** Verifies parsing of patient, ADI, TOC, and device-request hash routes. */
import { describe, expect, it } from 'vitest'
import { parseHashRoute } from './routes'

describe('parseHashRoute', () => {
  it('parses patient device-request creation routes', () => {
    expect(parseHashRoute('#/patients/patient%201/device-requests/new')).toEqual({ name: 'patientDeviceRequestCreate', patientId: 'patient 1' })
  })
  it('parses TOC creation and detail routes without treating new as a document id', () => {
    expect(parseHashRoute('#/patients/patient-1/transitions-of-care/new')).toEqual({ name: 'patientTocCreate', patientId: 'patient-1' })
    expect(parseHashRoute('#/patients/patient-1/transitions-of-care/toc-1')).toEqual({ name: 'tocDetail', patientId: 'patient-1', documentReferenceId: 'toc-1' })
  })
})
