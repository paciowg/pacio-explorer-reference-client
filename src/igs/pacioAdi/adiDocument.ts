import type { Composition, DocumentReference, Reference } from 'fhir/r4'

export type AdiDocumentModel = {
  versionNumber?: string
  dataEnterer?: Reference
  facilitators: Reference[]
}

const ADI_DOC_VERSION_EXTENSION_URL = 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-docVersionNumber-extension'
const ADI_DATA_ENTERER_EXTENSION_URL = 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/adi-dataEnterer-extension'
const ADI_DOCUMENT_REFERENCE_PROFILE_URL = 'http://hl7.org/fhir/us/pacio-adi/StructureDefinition/ADI-DocumentReference'
const ACP_SERVICES_CODE = 'acp-services'

export function readAdiDocument(
  composition: Composition,
  documentReference: DocumentReference,
): AdiDocumentModel | null {
  const isAdi = documentReference.meta?.profile?.includes(ADI_DOCUMENT_REFERENCE_PROFILE_URL) ||
    composition.meta?.profile?.some((profile) => profile.includes('pacio-adi'))
  if (!isAdi) return null

  const versionNumber = composition.extension?.find((extension) => extension.url === ADI_DOC_VERSION_EXTENSION_URL)?.valueString ||
    documentReference.extension?.find((extension) => extension.url === ADI_DOC_VERSION_EXTENSION_URL)?.valueString
  const dataEnterer = composition.extension?.find((extension) => extension.url === ADI_DATA_ENTERER_EXTENSION_URL)?.valueReference
  const facilitators = composition.event
    ?.filter((event) => event.code?.some((concept) => concept.coding?.some((coding) => coding.code === ACP_SERVICES_CODE)))
    .flatMap((event) => event.detail ?? []) ?? []
  return { versionNumber, dataEnterer, facilitators }
}
