import type { Attachment, Binary } from 'fhir/r4'

export type AttachmentViewer = { label: string; open: () => void }

function createBlobUrlViewer(label: string, mimeType: string, byteCharacters: string): AttachmentViewer {
  return {
    label,
    open: () => {
      const bytes = Uint8Array.from(byteCharacters, (character) => character.charCodeAt(0))
      const blobUrl = window.URL.createObjectURL(new Blob([bytes], { type: mimeType }))
      window.open(blobUrl, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000)
    },
  }
}

export function createAttachmentViewer(label: string, attachment: Attachment): AttachmentViewer | null {
  const contentType = attachment.contentType || ''
  if (contentType !== 'application/pdf') return null
  if (attachment.data) {
    try { return createBlobUrlViewer(label, contentType, atob(attachment.data)) } catch { return null }
  }
  if (attachment.url) return { label, open: () => window.open(attachment.url!, '_blank', 'noopener,noreferrer') }
  return null
}

export function createBinaryViewer(label: string, binary: Binary): AttachmentViewer | null {
  if (binary.contentType !== 'application/pdf' || !binary.data) return null
  try { return createBlobUrlViewer(label, binary.contentType, atob(binary.data)) } catch { return null }
}
