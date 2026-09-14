export type RobotsAiIssueType = 'wildcard_blocked' | 'bot_blocked' | 'content_signal_missing';
export interface RobotsAiIssue {
  type: RobotsAiIssueType;
  severity: 'error' | 'warn';
  bot?: string;
  detail: string;
}
export interface RobotsGruppe {
  agents: string[];
  rules: { key: string; value: string }[];
}
export const SUCH_UND_ABRUF_BOTS: string[];
export function robotsGruppen(content: string): RobotsGruppe[];
export function checkRobotsAiPolicy(content: string): RobotsAiIssue[];
