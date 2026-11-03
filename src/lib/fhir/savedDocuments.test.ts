/** Verifies snapshot preservation, destination indexing, patient boundaries, and staged recovery without external writes. */
import type { Composition, DocumentReference, List, Organization, Patient } from 'fhir/r4'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ match: vi.fn(), write: vi.fn(), load: vi.fn() }))
vi.mock('./documentPublishing', async (original) => ({ ...await original<typeof import('./documentPublishing')>(), matchDocumentPatient: mocks.match }))
vi.mock('./resourceTransport', async (original) => ({ ...await original<typeof import('./resourceTransport')>(), createResourceWithOutcome: mocks.write }))
vi.mock('./documentDetails', () => ({ loadDocumentDetails: mocks.load }))

import { FhirCreateError } from './resourceTransport'
import { destinationIndex, loadSavedDocument, sendSavedDocument, validateSavedDocument, type SavedDocument } from './savedDocuments'
import type { DocumentPublicationProgress } from './documentPublishing'

type SnapshotKind = 'document' | 'collection'

const sourceBase = 'https://source.test/fhir'
const destinationBase = 'https://destination.test/fhir'
const patient: Patient = { resourceType: 'Patient', id: 'p', identifier: [{ system: 'https://mrn.test', value: '123' }], name: [{ text: 'Pat Example' }] }
const destinationPatient: Patient = { ...patient, id: 'destination-patient' }

function fixture(kind: SnapshotKind): SavedDocument {
  const leading: Composition | List = kind === 'collection' ? {
    resourceType: 'List', id: 'list', status: 'current', mode: 'snapshot', subject: { reference: 'urn:uuid:patient' }, entry: [],
  } : {
    resourceType: 'Composition', id: 'composition', status: 'final', type: { text: 'Saved document' }, date: '2025-01-01', title: 'Original title',
    subject: { reference: 'urn:uuid:patient' }, author: [{ reference: 'urn:uuid:patient' }], section: [{ title: 'Saved narrative', text: { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml">Original narrative</div>' } }],
  }
  const documentReference: DocumentReference = { resourceType: 'DocumentReference', id: 'index', meta: { versionId: '2', lastUpdated: '2026-01-01T00:00:00Z', profile: ['https://profile.test/index'] },
    status: 'current', docStatus: 'final', subject: { reference: 'Patient/p', display: 'Pat Example' }, masterIdentifier: { system: 'https://docs.test', value: 'original' },
    identifier: [{ value: 'set-identifier' }], date: '2025-01-01T14:30:00Z', author: [{ reference: 'PractitionerRole/author', display: 'Original author' }],
    custodian: { reference: 'Organization/custodian' },
    extension: [{ url: 'https://extension.test', valueString: 'Captured metadata' }],
    content: [{ attachment: { contentType: 'application/fhir+json', url: 'Bundle/saved' } }],
  }
  leading.extension = [{ url: 'https://unrepresented.test', valueString: 'Keep this' }]
  return { patient: structuredClone(patient), documentReference, bundleReference: 'Bundle/saved', bundle: {
    resourceType: 'Bundle', id: 'saved', type: kind === 'collection' ? 'collection' : 'document', meta: { versionId: '3', lastUpdated: '2026-02-01T00:00:00Z', profile: ['https://profile.test'], security: [{ code: 'R' }] },
    identifier: { system: 'urn:ietf:rfc:3986', value: 'urn:uuid:original-document' }, timestamp: '2025-01-01T14:30:00Z',
    entry: [{ fullUrl: 'urn:uuid:leading', resource: leading }, { fullUrl: 'urn:uuid:patient', resource: structuredClone(patient) }],
  } }
}
function input(data: SavedDocument) { return { sourceBase, destinationBase, data } }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.match.mockResolvedValue({ patient: destinationPatient, warning: '' })
  mocks.write.mockImplementation(async (_base, resource) => ({ ...resource, id: `new-${resource.resourceType}` }))
})

describe('sending saved documents', () => {
  it.each(['document', 'collection'] as const)('preserves the complete %s snapshot and original input while creating a destination index', async (kind) => {
    const data = fixture(kind)
    const before = structuredClone(data)
    await sendSavedDocument(input(data), {})
    expect(data).toEqual(before)
    expect(mocks.write).toHaveBeenCalledTimes(2)
    const sent = mocks.write.mock.calls[0][1]
    expect(sent).toEqual({ ...data.bundle, id: undefined, meta: { profile: data.bundle.meta!.profile, security: data.bundle.meta!.security } })
    expect(sent.entry).toEqual(before.bundle.entry)
    const index = mocks.write.mock.calls[1][1] as DocumentReference
    expect(index).toMatchObject({ subject: { reference: 'Patient/destination-patient' }, masterIdentifier: before.documentReference.masterIdentifier,
      identifier: before.documentReference.identifier, date: before.documentReference.date,
      extension: before.documentReference.extension,
      content: [{ attachment: { url: `${destinationBase}/Bundle/new-Bundle` } }],
    })
    expect(index.author).toBeUndefined()
    expect(index.custodian).toBeUndefined()
    expect(index.authenticator).toBeUndefined()
    expect(index.id).toBeUndefined()
    expect(index.meta?.versionId).toBeUndefined()
    expect(mocks.match).toHaveBeenCalledWith(sourceBase, destinationBase, patient)
  })
  it('creates a destination Patient only when no match exists, retaining the embedded Patient', async () => {
    mocks.match.mockResolvedValue({ warning: '' })
    const data = fixture('document')
    await sendSavedDocument(input(data), {})
    expect(mocks.write.mock.calls.map((call) => call[1].resourceType)).toEqual(['Patient', 'Bundle', 'DocumentReference'])
    expect(mocks.write.mock.calls[0][1].id).toBeUndefined()
    expect(mocks.write.mock.calls[1][1].entry[1].resource).toEqual(patient)
  })
  it('retains the destination Patient and Bundle after definite index rejection and retries only the index', async () => {
    const progress: DocumentPublicationProgress = {}
    const data = fixture('document')
    mocks.write.mockResolvedValueOnce({ ...data.bundle, id: 'retained' }).mockRejectedValueOnce(new FhirCreateError('Index rejected', false)).mockResolvedValueOnce({ resourceType: 'DocumentReference', id: 'done' })
    await expect(sendSavedDocument(input(data), progress)).rejects.toThrow('Index rejected')
    expect(progress.bundle?.id).toBe('retained')
    await sendSavedDocument(input(data), progress)
    await sendSavedDocument(input(data), progress)
    expect(mocks.write.mock.calls.map((call) => call[1].resourceType)).toEqual(['Bundle', 'DocumentReference', 'DocumentReference'])
    expect(mocks.write.mock.calls[2][1].content[0].attachment.url).toBe(`${destinationBase}/Bundle/retained`)
    expect(mocks.match).toHaveBeenCalledOnce()
  })
  it.each(['Patient', 'Bundle', 'DocumentReference'])('blocks retries after an uncertain %s write', async (stage) => {
    mocks.match.mockResolvedValue({ warning: '' })
    const progress: DocumentPublicationProgress = {}
    mocks.write.mockImplementation(async (_base, resource) => {
      if (resource.resourceType === stage) throw new FhirCreateError('Connection lost', true)
      return { ...resource, id: 'created' }
    })
    const data = fixture('document')
    await expect(sendSavedDocument(input(data), progress)).rejects.toThrow('Connection lost')
    const count = mocks.write.mock.calls.length
    expect(progress.uncertain).toBe(stage)
    await expect(sendSavedDocument(input(data), progress)).rejects.toThrow('uncertain')
    expect(mocks.write).toHaveBeenCalledTimes(count)
  })
  it('blocks a changed destination after a partial send and normalizes current-server comparisons', async () => {
    const data = fixture('document')
    await expect(sendSavedDocument({ ...input(data), destinationBase: `${sourceBase}/` }, {})).rejects.toThrow('another destination')
    await expect(sendSavedDocument(input(data), { destination: 'https://elsewhere.test/fhir' })).rejects.toThrow('cannot change')
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('stops before writes when destination matching fails', async () => {
    mocks.match.mockRejectedValue(new Error('Search failed'))
    await expect(sendSavedDocument(input(fixture('document')), {})).rejects.toThrow('Search failed')
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('rejects unfamiliar index and Patient reference dependencies before any writes', async () => {
    const data = fixture('document')
    data.documentReference.extension = [{ url: 'urn:custom', valueReference: { reference: 'Organization/custom' } }]
    await expect(sendSavedDocument(input(data), {})).rejects.toThrow('Unsupported destination DocumentReference reference')
    mocks.match.mockResolvedValue({ warning: '' })
    const patientData = fixture('document')
    ;(patientData.bundle.entry![1].resource as Patient).extension = [{ url: 'urn:custom', valueReference: { reference: 'urn:uuid:leading' } }]
    await expect(sendSavedDocument(input(patientData), {})).rejects.toThrow('Unsupported destination Patient reference')
    expect(mocks.write).not.toHaveBeenCalled()
  })
})

describe('saved document validation and indexing', () => {
  it('loads and validates a captured snapshot without substituting current clinical resources', async () => {
    const data = fixture('document')
    mocks.load.mockResolvedValue(data)
    expect(await loadSavedDocument(sourceBase, 'p', 'index')).toEqual(data)
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(sourceBase, 'p', 'index')
    expect(mocks.match).not.toHaveBeenCalled()
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('rejects unavailable Bundles without loading live clinical resources', async () => {
    mocks.load.mockResolvedValue({ ...fixture('document'), bundle: null })
    await expect(loadSavedDocument(sourceBase, 'p', 'index')).rejects.toThrow('unavailable')
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(sourceBase, 'p', 'index')
  })
  it.each(['document', 'collection'] as const)('rejects a mismatched patient for %s snapshots', (kind) => {
    const data = fixture(kind)
    data.documentReference.subject = { reference: 'Patient/another' }
    expect(() => validateSavedDocument(data, sourceBase, 'p')).toThrow('another patient')
  })
  it('rejects changed captured Patient demographics and mismatched Composition subjects', () => {
    const data = fixture('document')
    data.patient = { ...patient, identifier: [], name: [{ text: 'Another Patient' }] }
    expect(() => validateSavedDocument(data, sourceBase, 'p')).toThrow('Captured patient')
    const badSubject = fixture('document')
    ;(badSubject.bundle.entry![0].resource as Composition).subject = { reference: 'Patient/other' }
    expect(() => validateSavedDocument(badSubject, sourceBase, 'p')).toThrow('different patient')
  })
  it.each(['urn:uuid:missing', 'Observation/missing', `${sourceBase}/Observation/missing`, 'https://external.test/Observation/missing'])('blocks an unresolved Composition reference %s', (reference) => {
    const data = fixture('document')
    ;(data.bundle.entry![0].resource as Composition).section = [{ entry: [{ reference }] }]
    expect(() => validateSavedDocument(data, sourceBase, 'p')).toThrow('reference')
  })
  it('rewrites saved relative, absolute, and historical references while preserving contained references', async () => {
    const data = fixture('document')
    const composition = data.bundle.entry![0].resource as Composition
    data.bundle.entry![1].resource!.meta = { versionId: '1' }
    composition.author = [{ reference: `${sourceBase}/Patient/p/_history/1` }]
    composition.contained = [{ resourceType: 'Organization', id: 'org', name: 'Captured organization' } as Organization]
    composition.custodian = { reference: '#org' }
    composition.subject = { reference: 'Patient/p' }
    await sendSavedDocument(input(data), {})
    const sent = mocks.write.mock.calls[0][1]
    expect(sent.entry[0].resource.subject.reference).toBe('urn:uuid:patient')
    expect(sent.entry[0].resource.author[0].reference).toBe('urn:uuid:patient')
    expect(sent.entry[0].resource.custodian.reference).toBe('#org')
    expect(composition.subject?.reference).toBe('Patient/p')
  })
  it('rejects external links outside the accepted attachment URLs', async () => {
    const data = fixture('document')
    ;(data.bundle.entry![0].resource as Composition).relatesTo = [{ code: 'replaces', targetReference: { reference: 'https://archive.test/Composition/previous' } }]
    await expect(sendSavedDocument(input(data), {})).rejects.toThrow('Unresolved captured reference')
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('preserves other attachments while omitting optional participant references', () => {
    const data = fixture('document')
    data.documentReference.author = [{ reference: '#author' }, { reference: 'https://external.test/Practitioner/p' }]
    data.documentReference.content.push({ attachment: { url: 'Binary/pdf', title: 'Original PDF' } })
    const index = destinationIndex(data, sourceBase, destinationPatient, `${destinationBase}/Bundle/new`)
    expect(index.author).toBeUndefined()
    expect(index.content[1].attachment.url).toBe(`${sourceBase}/Binary/pdf`)
  })
  it('drops byte metadata only for the relocated Bundle attachment', () => {
    const data = fixture('document')
    data.documentReference.content[0].attachment.hash = 'original-bundle-hash'
    data.documentReference.content[0].attachment.size = 1234
    data.documentReference.content.push({ attachment: { url: 'Binary/pdf', hash: 'unchanged-pdf-hash', size: 456 } })
    const index = destinationIndex(data, sourceBase, destinationPatient, `${destinationBase}/Bundle/new`)
    expect(index.content[0].attachment.hash).toBeUndefined()
    expect(index.content[0].attachment.size).toBeUndefined()
    expect(index.content[1].attachment).toMatchObject({ hash: 'unchanged-pdf-hash', size: 456 })
    expect(data.documentReference.content[0].attachment.hash).toBe('original-bundle-hash')
  })
})
