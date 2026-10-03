export function findeVorlagenPlatzhalter(
  dateien: { pfad: string; inhalt: string }[],
): { pfad: string; zeile: number; platzhalter: string }[];
