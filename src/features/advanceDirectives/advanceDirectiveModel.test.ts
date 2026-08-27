import { describe, expect, it } from 'vitest'
import type { Binary, Bundle, Composition, DocumentReference } from 'fhir/r4'
import {
  buildBundleDerivedData,
  buildDocumentDetailsRows,
  getBundleLoadWarning,
  MISSING_COMPOSITION_WARNING,
} from './advanceDirectiveModel'

function rowValue(rows: ReturnType<typeof buildDocumentDetailsRows>, label: string) {
  return rows.find((row) => row.label === label)?.value
}

describe('advance-directive model', () => {
  const documentReference: DocumentReference = {
    resourceType: 'DocumentReference',
    status: 'current',
    docStatus: 'preliminary',
    meta: { profile: ['http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-DocumentReference'] },
    type: { text: 'DocumentReference type' },
    subject: { display: 'DocumentReference subject' },
    author: [{ display: 'DocumentReference author' }],
    extension: [{
      url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-docVersionNumber-extension',
      valueString: 'document-reference-version',
    }],
    content: [],
  }

  it('preserves Composition precedence while applying ADI enrichment', () => {
    const composition: Composition = {
      resourceType: 'Composition',
      status: 'final',
      type: { text: 'Composition type' },
      category: [{ text: 'Composition category' }],
      subject: { display: 'Composition subject' },
      author: [{ display: 'Composition author' }],
      date: '2025-01-01',
      title: 'Composition title',
      extension: [
        {
          url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-docVersionNumber-extension',
          valueString: 'composition-version',
        },
        {
          url: 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-dataEnterer-extension',
          valueReference: { display: 'Composition data enterer' },
        },
      ],
      event: [{
        code: [{ coding: [{ code: 'acp-services' }] }],
        detail: [{ display: 'Composition facilitator' }],
      }],
    }

    const rows = buildDocumentDetailsRows(documentReference, composition)
    expect(rowValue(rows, 'Status')).toBe('final')
    expect(rowValue(rows, 'Version')).toBe('composition-version')
    expect(rowValue(rows, 'Type')).toBe('Composition type')
    expect(rowValue(rows, 'Subject')).toBe('Composition subject')
    expect(rowValue(rows, 'Author')).toBe('Composition author')
    expect(rowValue(rows, 'Facilitator')).toBe('Composition facilitator')
    expect(rowValue(rows, 'Data enterer')).toBe('Composition data enterer')
  })

  it('retains the referenced-Bundle warning text', () => {
    expect(MISSING_COMPOSITION_WARNING).toBe(
      'A Bundle was referenced, but no Composition was found. Showing DocumentReference details.',
    )
    expect(getBundleLoadWarning(new Error('Server unavailable.'))).toBe(
      'Unable to load referenced Bundle. Server unavailable.',
    )
    expect(getBundleLoadWarning('unknown')).toBe(
      'Unable to load referenced Bundle. Showing DocumentReference details.',
    )
  })

  it('discovers supported PDFs and silently omits malformed or unsupported data', () => {
    const composition: Composition = {
      resourceType: 'Composition', status: 'final', type: { text: 'PMO' },
      date: '2025-01-01', title: 'PMO', author: [],
      section: [{
        title: 'Source PDF',
        entry: [
          { reference: 'Binary/valid' },
          { reference: 'Binary/invalid' },
          { reference: 'Binary/text' },
        ],
      }],
    }
    const bundle: Bundle = {
      resourceType: 'Bundle', type: 'document', entry: [
        { resource: composition },
        { resource: { resourceType: 'Binary', id: 'valid', contentType: 'application/pdf', data: 'JVBERg==' } as Binary },
        { resource: { resourceType: 'Binary', id: 'invalid', contentType: 'application/pdf', data: '%%%not-base64%%%' } as Binary },
        { resource: { resourceType: 'Binary', id: 'text', contentType: 'text/plain', data: 'dGV4dA==' } as Binary },
      ],
    }

    expect(buildBundleDerivedData(bundle, 'https://example.test/fhir')?.pdfViewers)
      .toHaveLength(1)
  })
})
