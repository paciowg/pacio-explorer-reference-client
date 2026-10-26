/** Verifies the requested document section order and preservation of document creation actions. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PatientDocumentsView } from './PatientDocumentsView'

describe('patient Documents view', () => {
  it('renders TOC, ADI, medication Lists, and collections as four separate sections in order', () => {
    const html = renderToStaticMarkup(<PatientDocumentsView patientId="patient-1" baseUrl="https://source.test/fhir" summary={{ advanceDirectives: [], transitionOfCares: [], clinicalSectionEmptyMessage: 'None recorded' }} />)
    expect([...html.matchAll(/<h3>(.*?)<\/h3>/g)].map((match) => match[1])).toEqual(['TOC Documents', 'Advance Directives', 'SMP Medication Lists', 'SMP Collections'])
    expect(html.match(/<section class="summary-card clinical-summary-card">/g)).toHaveLength(4)
    for (const action of ['Create TOC document', 'Create ADI PMO', 'Create medication list', 'Create SMP collection']) expect(html).toContain(action)
  })
})
