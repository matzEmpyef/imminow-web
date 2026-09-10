import { CheckSquare, ClipboardList, ExternalLink, FileUp, Link2, Type } from 'lucide-react'
import type { components } from '@/api/schema'

export type ComponentInput = components['schemas']['ComponentInput']
export type ComponentType = ComponentInput['type']

export const COMPONENT_TYPES: ComponentType[] = ['text', 'file_upload', 'checklist', 'questionnaire', 'form_link', 'weblink']

export const COMPONENT_TYPE_LABELS: Record<ComponentType, string> = {
  text: 'Text',
  file_upload: 'File Upload',
  checklist: 'Checklist',
  questionnaire: 'Questionnaire',
  // Renamed from "Form Link" (user, 2026-09-10) — it links one of this console's own forms.
  form_link: 'immiNow Form',
  weblink: 'Web Link',
}

/**
 * A Web Link's address must be a full http(s) URL (2026-09-10). The app hands it straight to the
 * phone's browser, so anything else — a bare "www.site.com", or a `javascript:` URL — is refused
 * here and again by the server.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

// Lives here rather than in PlanComponentBlock.tsx — a plain module export mixed into a file
// that otherwise only exports components trips oxlint's react-refresh rule.
export const COMPONENT_TYPE_ICONS: Record<ComponentType, typeof Type> = {
  text: Type,
  file_upload: FileUp,
  checklist: CheckSquare,
  questionnaire: ClipboardList,
  form_link: Link2,
  weblink: ExternalLink,
}

// New components get a client-generated id immediately (rather than leaving it undefined until
// save) so drag-and-drop has a stable identity to track from the moment a component is added —
// same reasoning as Form Builder's formFields.ts newFieldId(), and safe for the same reason: the
// server already accepts a client-supplied id as "preserve this one" (ComponentInput.id's own
// description).
export function newComponentId() {
  return crypto.randomUUID()
}
