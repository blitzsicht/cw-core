export type TableIssueType = 'table_without_scroll_rule';
export interface TableIssue {
  page: string;
  type: TableIssueType;
  detail: string;
}
export function zaehleInhaltsTabellen(html: string): number;
export function hatTabellenSchutz(html: string): boolean;
export function checkTableScroll(seiten: { page: string; html: string }[]): TableIssue[];
