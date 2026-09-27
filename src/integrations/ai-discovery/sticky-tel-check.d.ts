export type StickyTelIssueType = 'no_sticky_tel';

export interface StickyTelIssue {
  type: StickyTelIssueType;
  details: string;
}

export const STICKY_TEL_MELDUNG: string;

export function hatTelLink(html: string): boolean;

export function telImFixiertenElement(html: string): boolean;

export function checkStickyTel(
  seiten: { page: string; html: string }[],
  optionen?: { stickyTel?: boolean },
): StickyTelIssue[];
