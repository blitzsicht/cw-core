export type AntwortfristIssueType = 'frist_ohne_angabe' | 'frist_weicht_ab';
export interface AntwortfristIssue {
  type: AntwortfristIssueType;
  page: string;
  frist: string;
  details: string;
}
/** Sichtbarer Text einer Seite (ohne script/style/template), Blockgrenzen als Zeilenumbruch. */
export declare function sichtbarerText(html: string): string;
/** Antwortfristen im HTML, die nicht aus `siteData.antwortfrist` stammen. */
export declare function checkAntwortfrist(
  html: string,
  page: string,
  antwortfrist: unknown,
): AntwortfristIssue[];
