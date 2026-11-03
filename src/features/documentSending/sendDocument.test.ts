/** Verifies document-type identification and delegation while generic snapshot and transport checks remain in the FHIR library tests. */
import type { Composition, List } from 'fhir/r4'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SMP_INDEX } from '../../igs/pacioSmp/smp'
import { TOC_DOCUMENT_REFERENCE_PROFILE } from '../../igs/pacioToc/tocDocument'
import type { SavedDocument } from '../../lib/fhir/savedDocuments'
import type { DocumentPublicationProgress } from '../../lib/fhir/documentPublishing'

const mocks = vi.hoisted(() => ({ load: vi.fn(), send: vi.fn() }))
vi.mock('../../lib/fhir/savedDocuments', () => ({ loadSavedDocument: mocks.load, sendSavedDocument: mocks.send }))

import { loadSavedDocument, sendSavedDocument, validateDocumentKind, type DocumentKind } from './sendDocument'

const sourceBase = 'https://source.test/fhir'
const destinationBase = 'https://destination.test/fhir'
function fixture(kind: DocumentKind): SavedDocument {
  const leading: Composition | List = kind === 'smp' ? {
    resourceType: 'List', id: 'list', status: 'current', mode: 'snapshot', subject: { reference: 'urn:uuid:patient' },
  } : {
    resourceType: 'Composition', status: 'final', type: { text: 'Saved document' }, date: '2025-01-01', title: 'Original title', subject: { reference: 'urn:uuid:patient' }, author: [],
  }
  const patient = { resourceType: 'Patient' as const, id: 'p', name: [{ text: 'Pat Example' }] }
  return { patient, bundleReference: 'Bundle/saved', bundle: { resourceType: 'Bundle', type: kind === 'smp' ? 'collection' : 'document',
    entry: [{ fullUrl: 'urn:uuid:leading', resource: leading }, { fullUrl: 'urn:uuid:patient', resource: patient }],
  }, documentReference: { resourceType: 'DocumentReference', id: 'index', status: 'current', subject: { reference: 'Patient/p' }, content: [],
    meta: { profile: [kind === 'smp' ? SMP_INDEX : kind === 'toc' ? TOC_DOCUMENT_REFERENCE_PROFILE : 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-DocumentReference'] },
  } }
}

beforeEach(() => vi.resetAllMocks())

describe('document sending adapter', () => {
  it.each(['toc', 'adi', 'smp'] as const)('checks %s identification and delegates loading and sending without changing the snapshot', async (kind) => {
    const data = fixture(kind)
    const before = structuredClone(data)
    const progress: DocumentPublicationProgress = {}
    mocks.load.mockResolvedValue(data)
    mocks.send.mockResolvedValue(data.documentReference)
    expect(await loadSavedDocument(sourceBase, 'p', 'index', kind)).toBe(data)
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(sourceBase, 'p', 'index')
    expect(await sendSavedDocument({ sourceBase, destinationBase, data, kind }, progress)).toBe(data.documentReference)
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ sourceBase, destinationBase, data }, progress)
    expect(data).toEqual(before)
  })
  it.each(['toc', 'adi', 'smp'] as const)('rejects unrecognized %s indexes before delegating a send', async (kind) => {
    const data = fixture(kind)
    delete data.documentReference.meta
    mocks.load.mockResolvedValue(data)
    await expect(loadSavedDocument(sourceBase, 'p', 'index', kind)).rejects.toThrow()
    await expect(sendSavedDocument({ sourceBase, destinationBase, data, kind }, {})).rejects.toThrow()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('retains ADI category-based recognition and requires a leading Composition for documents', () => {
    const data = fixture('adi')
    delete data.documentReference.meta
    data.documentReference.category = [{ coding: [{ code: '42348-3' }] }]
    expect(() => validateDocumentKind(data, 'adi')).not.toThrow()
    expect(() => validateDocumentKind(fixture('smp'), 'toc')).toThrow('leading Composition')
  })
  it('retains SMP membership patient checks', () => {
    const data = fixture('smp')
    ;(data.bundle.entry![0].resource as List).subject = { reference: 'Patient/another' }
    expect(() => validateDocumentKind(data, 'smp')).toThrow('mismatched patient')
  })
  it('propagates generic load failures without attempting a send', async () => {
    mocks.load.mockRejectedValue(new Error('DocumentReference belongs to another patient.'))
    await expect(loadSavedDocument(sourceBase, 'p', 'index', 'toc')).rejects.toThrow('another patient')
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
