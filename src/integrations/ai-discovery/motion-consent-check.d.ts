export type MotionIssueType = 'motion_without_consent';

export interface MotionIssue {
  type: MotionIssueType;
  /** Der ausgelieferte Runtime-Marker, z.B. `data-motion-tilt`. */
  marker: string;
  /** Komponente(n), die den Marker setzen. Bei mehreren: "A oder B". */
  component: string;
  /** Wie oft der Marker im bereinigten Markup steht. */
  count: number;
  details: string;
}

/** Prop-Key → Komponente, die daraufhin gerendert wird. */
export const MOTION_PROP_KEYS: Readonly<Record<string, string>>;

/** Motion-Komponenten, die es nur per direktem Import gibt (keine Prop). */
export const IMPORT_ONLY_MOTION: readonly string[];

export function stripInlineBlocks(html: string): string;
export function stripComments(code: string): string;
export function countMarker(strippedHtml: string, marker: string): number;
export function buildMarkerOwners(
  motionComponents: { name: string; source: string }[],
): Map<string, string[]>;
export function collectConsent(sourceTexts: string[]): Set<string>;
export function checkMotionConsent(input: {
  markerCounts: Record<string, number>;
  markerOwners: Map<string, string[]>;
  consented: Set<string>;
  acknowledged?: readonly string[];
}): MotionIssue[];
