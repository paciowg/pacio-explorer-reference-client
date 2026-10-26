/** Verifies patient-view navigation and parsing of document, SMP, device, nutrition, and FHIR viewer routes. */
import { describe, expect, it } from 'vitest'
import { parseHashRoute } from './routes'

describe('parseHashRoute', () => {
  it.each([
    ['medication-lists/new', { name: 'smpListCreate' }],
    ['medication-lists/list-1', { name: 'smpListDetail', resourceId: 'list-1' }],
    ['smp-collections/new?list=list-1', { name: 'smpCollectionCreate' }],
    ['smp-collections/index-1', { name: 'smpCollectionDetail', resourceId: 'index-1' }],
  ])('parses the SMP route %s', (path, expected) => {
    expect(parseHashRoute(`#/patients/patient%201/${path}`)).toEqual({ ...expected, patientId: 'patient 1' })
  })
  it('defaults existing patient links and unknown views to personal information', () => {
    for (const suffix of ['', '?view=personal', '?view=unknown']) {
      expect(parseHashRoute(`#/patients/patient%201${suffix}`)).toEqual({
        name: 'patientDetail', patientId: 'patient 1', view: 'personal',
      })
    }
  })
  it.each(['clinical', 'documents'] as const)('opens the %s patient view directly', (view) => {
    expect(parseHashRoute(`#/patients/patient%201?view=${view}`)).toEqual({
      name: 'patientDetail', patientId: 'patient 1', view,
    })
  })
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
