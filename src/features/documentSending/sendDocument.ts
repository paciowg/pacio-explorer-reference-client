/** Applies TOC, ADI, and SMP identification checks before delegating saved-document operations to the generic FHIR layer. */
import type { Composition } from 'fhir/r4'
import { readAdiDocument } from '../../igs/pacioAdi/adiDocument'
import { isSmpIndex } from '../../igs/pacioSmp/smp'
import type { DocumentPublicationProgress } from '../../lib/fhir/documentPublishing'
import { loadSavedDocument as loadSnapshot, sendSavedDocument as sendSnapshot, type SavedDocument } from '../../lib/fhir/savedDocuments'
import { validateSnapshotPatient } from '../medicationProfiles/smpViewing'
import { isTocDocumentReference } from '../transitionsOfCare/tocModel'

export type DocumentKind = 'toc' | 'adi' | 'smp'
export const documentKindLabels: Record<DocumentKind, string> = { toc: 'TOC Document', adi: 'ADI Document', smp: 'SMP Collection' }

export function validateDocumentKind({ bundle, documentReference, patient }: SavedDocument, kind: DocumentKind) {
  if (kind === 'smp') {
    if (!isSmpIndex(documentReference)) throw new Error('This document is not an SMP Collection.')
    validateSnapshotPatient(bundle, patient)
  } else {
    const composition = bundle.entry?.[0]?.resource as Composition | undefined
    if (bundle.type !== 'document' || composition?.resourceType !== 'Composition') throw new Error('A document Bundle with a leading Composition is required.')
    const matchesKind = kind === 'toc' ? isTocDocumentReference(documentReference) : Boolean(readAdiDocument(composition, documentReference) || documentReference.category?.some((category) => category.coding?.some((coding) => coding.code === '42348-3')))
    if (!matchesKind) throw new Error('The saved document does not match this document type.')
  }
}

export async function loadSavedDocument(sourceBase: string, patientId: string, resourceId: string, kind: DocumentKind) {
  const data = await loadSnapshot(sourceBase, patientId, resourceId)
  validateDocumentKind(data, kind)
  return data
}

export async function sendSavedDocument(input: { sourceBase: string; destinationBase: string; data: SavedDocument; kind: DocumentKind }, progress: DocumentPublicationProgress) {
  validateDocumentKind(input.data, input.kind)
  return sendSnapshot({ sourceBase: input.sourceBase, destinationBase: input.destinationBase, data: input.data }, progress)
}
