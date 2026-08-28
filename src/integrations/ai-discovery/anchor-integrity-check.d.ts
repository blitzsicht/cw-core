export type AnchorIssueType = 'anchor_reopened_after_table' | 'anchor_without_name';
export interface AnchorIssue {
  page: string;
  type: AnchorIssueType;
  detail: string;
}
export function zaehleAnkerNachTabelle(html: string): number;
export function zaehleNamenloseAnker(html: string): number;
export function checkAnchorIntegrity(seiten: { page: string; html: string }[]): AnchorIssue[];
