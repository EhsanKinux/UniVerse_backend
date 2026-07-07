/**
 * The kinds of "join option" a group may advertise. Each `GroupLink` row is one
 * of these; its kind decides which payload field is used (see the schema):
 *   • "link"   → a clickable invite/join URL (GroupLink.url)
 *   • "handle" → a copyable @username or invite code (GroupLink.handle)
 *   • "qr"     → an uploaded QR image (GroupLink.qrStoredName/qrMimeType)
 *
 * Stored as a plain string in the database (so adding a kind needs NO migration),
 * but admin input is validated against this set, and the labels drive the admin
 * "kind" dropdown. The PWA maps each kind to its own icon + interaction.
 */
export const GROUP_LINK_KINDS = ['link', 'handle', 'qr'] as const;

export type GroupLinkKind = (typeof GROUP_LINK_KINDS)[number];

/** The kind assumed when none is supplied or an unknown one slips through. */
export const DEFAULT_GROUP_LINK_KIND: GroupLinkKind = 'link';

/** Persian labels shown to staff in the admin "kind" dropdown. */
export const GROUP_LINK_KIND_LABELS: Record<GroupLinkKind, string> = {
  link: 'پیوند عضویت (لینک)',
  handle: 'شناسه یا کد عضویت (قابل کپی)',
  qr: 'کد QR (تصویر)',
};

/** Type-guard: is this one of the known join-option kinds? */
export function isKnownGroupLinkKind(kind: string): kind is GroupLinkKind {
  return (GROUP_LINK_KINDS as readonly string[]).includes(kind);
}
