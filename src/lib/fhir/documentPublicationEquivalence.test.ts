/** Compares real creation and saved-send workflows against in-memory FHIR servers, including repeated sends and Patient reuse. */
import type { Bundle, Condition, DocumentReference, List, Organization, Patient, Resource } from 'fhir/r4'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTocDocument } from '../../features/transitionsOfCare/createTocDocument'
import { createPmoDocument } from '../../features/advanceDirectives/createPmoDocument'
import { matchSmpPatient, publishSmpCollection } from '../../features/medicationProfiles/smpPublishing'
import { prepareSmpSnapshot } from '../../features/medicationProfiles/smpReferences'
import { loadSavedDocument, sendSavedDocument, type DocumentKind } from '../../features/documentSending/sendDocument'
import { fixturePractitioner, fixturePractitionerRole } from '../../test/fixtures/adiPmoFixture'
import { walkReferences } from './bundleReferences'

const source = 'https://source.test/fhir'
const destination = 'https://destination.test/fhir'
const date = '2026-01-02T03:04:05Z'
const patient: Patient = {
  resourceType: 'Patient', id: 'p', meta: { versionId: '1' },
  identifier: [{ system: 'urn:test:mrn', value: '123' }], name: [{ family: 'Example', given: ['Pat'] }],
  managingOrganization: { reference: 'Organization/org' }, generalPractitioner: [{ reference: 'PractitionerRole/role-1' }],
}
const list: List = {
  resourceType: 'List', id: 'list', status: 'current', mode: 'snapshot', title: 'Captured medications',
  code: { text: 'Medication list' }, subject: { reference: 'Patient/p' }, source: { reference: 'PractitionerRole/role-1' },
  emptyReason: { text: 'No medications' },
}

function servers(existingPatient: boolean) {
  const stores = new Map<string, Map<string, Resource>>([
    [source, new Map<string, Resource>([
      ['Patient/p', structuredClone(patient)], ['List/list', structuredClone(list)],
      ['PractitionerRole/role-1', structuredClone(fixturePractitionerRole)], ['Practitioner/practitioner-1', structuredClone(fixturePractitioner)],
      ['Organization/org', { resourceType: 'Organization', id: 'org', name: 'Captured organization' } as Organization],
    ])],
    [destination, new Map<string, Resource>(existingPatient ? [['Patient/existing', { ...patient, id: 'existing' }]] : [])],
  ])
  const writes: { base: string; resource: Resource }[] = []
  let sequence = 0
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/fhir+json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const base = url.startsWith(`${source}/`) ? source : destination
    const path = new URL(url).pathname.slice('/fhir/'.length)
    const store = stores.get(base)!
    if (options?.method === 'POST') {
      const resource = JSON.parse(options.body as string) as Resource
      // Model a destination that rejects references to standalone resources on another server.
      if (resource.resourceType !== 'Bundle') walkReferences(resource, (node) => {
        if (typeof node.reference === 'string' && node.reference.startsWith(source)) throw new Error('External reference rejected')
      })
      writes.push({ base, resource: structuredClone(resource) })
      const saved = { ...resource, id: `saved-${++sequence}`, meta: { ...resource.meta, versionId: '1', lastUpdated: date } }
      store.set(`${resource.resourceType}/${saved.id}`, saved)
      return response(saved, 201)
    }
    if (path === 'metadata') return response({ resourceType: 'CapabilityStatement', fhirVersion: '4.0.1' })
    if (path === 'Patient') return response({ resourceType: 'Bundle', type: 'searchset', entry: [...store.values()].filter((r) => r.resourceType === 'Patient').map((resource) => ({ resource })) })
    const resource = store.get(path)
    if (!resource) throw new Error(`Unexpected read: ${url}`)
    return response(resource)
  }))
  return { stores, writes }
}

async function create(kind: DocumentKind, target: string) {
  if (kind === 'toc') return createTocDocument({
    sourceBaseUrl: source, destinationBaseUrl: target, patient, title: 'Captured transfer', status: 'final', createdAt: date,
    author: { reference: 'PractitionerRole/role-1' }, custodian: { reference: 'Organization/org' },
    sections: [
      { key: 'problems', entries: [{ resourceType: 'Condition', id: 'condition', subject: { reference: 'Patient/p' }, code: { text: 'Captured condition' } } as Condition], emptyReason: '' },
      { key: 'advanceDirectives', entries: [{ resourceType: 'DocumentReference', id: 'linked-adi', status: 'current', subject: { reference: 'Patient/p' },
        content: [{ attachment: { url: `${source}/Bundle/separate-adi`, contentType: 'application/fhir+json' } }, { attachment: { url: `${source}/Binary/pdf` } }],
      } as DocumentReference], emptyReason: '' },
    ],
  })
  if (kind === 'adi') return createPmoDocument({
    sourceBaseUrl: source, destinationBaseUrl: target, patient, practitionerRole: fixturePractitionerRole,
    practitionerByReference: new Map([['Practitioner/practitioner-1', fixturePractitioner]]),
    author: { reference: 'PractitionerRole/role-1' }, authenticator: { reference: 'PractitionerRole/role-1' },
    attester: { reference: 'Patient/p', display: 'Pat Example' }, custodian: { reference: 'Organization/org' }, status: 'final', signedDate: '2026-01-02',
    contextPeriodEnd: '2027-01-02', createdAt: date, pdfBase64: 'JVBERi0xLjQ=',
  })
  const snapshot = await prepareSmpSnapshot(source, patient, [list])
  return publishSmpCollection({ sourceBase: source, destinationBase: target, title: 'Captured medications', snapshot, match: await matchSmpPatient(source, target, patient) }, {})
}

function comparable(resource: Resource) {
  const copy = structuredClone(resource)
  delete copy.id
  if (copy.meta) { delete copy.meta.versionId; delete copy.meta.lastUpdated }
  if (copy.resourceType === 'DocumentReference') {
    const index = copy as DocumentReference
    index.subject = { ...index.subject, reference: 'Patient/destination' }
    for (const content of index.content) if (content.attachment.url?.startsWith(`${destination}/Bundle/`)) content.attachment.url = `${destination}/Bundle/destination`
  }
  return copy
}

afterEach(() => vi.unstubAllGlobals())

describe('destination workflow equivalence', () => {
  it.each(['toc', 'adi', 'smp'] as const)('%s produces equivalent content and two independent sends reuse one Patient', async (kind) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(date))
    try {
      for (const existing of [false, true]) {
        let uuid = 0
        vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++uuid}` })
        const direct = servers(existing)
        await create(kind, destination)
        const expected = direct.writes.filter((write) => write.base === destination).map((write) => comparable(write.resource))

        uuid = 0
        const indirect = servers(existing)
        const sourceIndex = await create(kind, source)
        // Live edits after creation must not replace captured clinical or demographic content.
        indirect.stores.get(source)!.set('Patient/p', { ...patient, telecom: [{ system: 'phone', value: 'new-live-value' }] } as Patient)
        indirect.stores.get(source)!.set('Organization/org', { resourceType: 'Organization', id: 'org', name: 'Changed organization' } as Organization)
        const data = await loadSavedDocument(source, 'p', sourceIndex.id!, kind)
        const before = structuredClone(data.bundle)
        expect(data.patient.telecom?.[0].value).toBe('new-live-value')
        await sendSavedDocument({ sourceBase: source, destinationBase: destination, data, kind }, {})
        expect(indirect.writes.filter((write) => write.base === destination).map((write) => comparable(write.resource))).toEqual(expected)
        expect(data.bundle).toEqual(before)

        await sendSavedDocument({ sourceBase: source, destinationBase: destination, data, kind }, {})
        const stored = [...indirect.stores.get(destination)!.values()]
        expect(stored.filter((r) => r.resourceType === 'Patient')).toHaveLength(1)
        expect(stored.filter((r) => r.resourceType === 'Bundle')).toHaveLength(2)
        expect(stored.filter((r) => r.resourceType === 'DocumentReference')).toHaveLength(2)
        const bundle = stored.find((r) => r.resourceType === 'Bundle') as Bundle
        expect(bundle.entry?.find((entry) => entry.resource?.resourceType === 'Patient')?.resource).toMatchObject({ generalPractitioner: expect.any(Array) })
        if (kind === 'toc') {
          const linked = bundle.entry?.find((entry) => entry.resource?.resourceType === 'DocumentReference')?.resource as DocumentReference
          expect(linked.content.map((content) => content.attachment.url)).toEqual([`${source}/Bundle/separate-adi`, `${source}/Binary/pdf`])
        }
      }
    } finally { vi.useRealTimers() }
  })
})
