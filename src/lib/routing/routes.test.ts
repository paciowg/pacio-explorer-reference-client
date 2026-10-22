/** Verifies parsing of patient, ADI, TOC, device-request, and nutrition-order hash routes. */
import { describe, expect, it } from 'vitest'
import { parseHashRoute } from './routes'

describe('parseHashRoute', () => {
  it('rejects raw-resource routes without a usable source server', () => {
    expect(parseHashRoute('#/fhir/Patient/p')).toEqual({ name: 'home' })
    expect(parseHashRoute('#/fhir/Patient/p?server=javascript%3Aalert(1)')).toEqual({ name: 'home' })
    expect(parseHashRoute('#/fhir/Patient/%XX?server=https%3A%2F%2Fexample.test')).toEqual({ name: 'home' })
  })
  it('parses nutrition-order creation routes', () => {
    expect(parseHashRoute('#/patients/patient%201/nutrition-orders/new')).toEqual({ name: 'patientNutritionOrderCreate', patientId: 'patient 1' })
  })
  it('parses patient device-request creation routes', () => {
    expect(parseHashRoute('#/patients/patient%201/device-requests/new')).toEqual({ name: 'patientDeviceRequestCreate', patientId: 'patient 1' })
  })
  it('parses TOC creation and detail routes without treating new as a document id', () => {
    expect(parseHashRoute('#/patients/patient-1/transitions-of-care/new')).toEqual({ name: 'patientTocCreate', patientId: 'patient-1' })
    expect(parseHashRoute('#/patients/patient-1/transitions-of-care/toc-1')).toEqual({ name: 'tocDetail', patientId: 'patient-1', documentReferenceId: 'toc-1' })
  })
})
