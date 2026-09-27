export type OpeningHoursIssueType = 'missing_opening_hours';

export interface OpeningHoursIssue {
  type: OpeningHoursIssueType;
  /** `@id` des Knotens, sonst `Typ:Name` — zum Entdoppeln über die Seiten. */
  id: string;
  details: string;
}

export function istLocalBusiness(typen: string[]): boolean;

export function checkOpeningHours(html: string, pagePath?: string): OpeningHoursIssue[];
