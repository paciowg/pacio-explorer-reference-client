/** Creates document identifiers using the naming system required by the PACIO ADI workflow. */
import type { Identifier } from 'fhir/r4'

const ADI_DOCUMENT_IDENTIFIER_SYSTEM = 'https://pacioproject.org/adi-document-identifier'
const ADI_DOCUMENT_SET_IDENTIFIER_SYSTEM =
  'https://pacioproject.org/adi-document-set-identifier'

export function createAdiDocumentIdentifier(value: string): Identifier {
  return { system: ADI_DOCUMENT_IDENTIFIER_SYSTEM, value }
}

export function createAdiDocumentSetIdentifier(value: string): Identifier {
  return { system: ADI_DOCUMENT_SET_IDENTIFIER_SYSTEM, value }
}
