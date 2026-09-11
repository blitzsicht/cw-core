export type WebMcpIssueType =
  | 'tool_without_description'
  | 'description_without_toolname'
  | 'required_field_without_name'
  | 'autosubmit'
  | 'no_submit_button'
  | 'duplicate_toolname'
  | 'honeypot_in_schema'
  | 'consent_in_schema';
export interface WebMcpIssue {
  page: string;
  type: WebMcpIssueType;
  detail: string;
}
export interface SchemaFeld {
  name: string;
  tag: string;
  type: string;
  attrs: Map<string, string>;
}
export function attribute(roh: string): Map<string, string>;
export function schemaFelder(formInnen: string): SchemaFeld[];
export function checkWebMcpForms(seiten: { page: string; html: string }[]): WebMcpIssue[];
