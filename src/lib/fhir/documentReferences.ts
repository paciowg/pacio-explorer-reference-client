/** Resolves same-server document Bundle attachment URLs from FHIR DocumentReferences. */
import type { DocumentReference } from 'fhir/r4'
import { normalizeBaseUrl } from './url'

export function getReferencedBundleUrl(documentReference: DocumentReference, baseUrl: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  for (const contentItem of documentReference.content ?? []) {
    const url = contentItem.attachment?.url?.trim()
    if (!url) continue
    if (url.startsWith('Bundle/')) return url
    if (url.startsWith('/Bundle/')) return url.slice(1)
    if (url.startsWith(`${normalizedBaseUrl}/Bundle/`)) return url
  }
  return ''
}
