// @ts-check
/**
 * @cw/core/integrations/ai-discovery/vorlagen-platzhalter-check
 *
 * Vorlagen-Platzhalter-Guard: `{{DOMAIN}}`, `{{LEGAL_NAME}}` & Co. aus
 * `templates/api-contact.ts` dürfen im Kundenrepo nicht stehen bleiben. Soft-Warn.
 *
 * ANLASS (Review cw-site #6, 03.10.2026): `cp` der Vorlage ließ in `api/contact.ts`
 * `allowedOrigins: ['https://{{DOMAIN}}', …]` und `fromName: '{{LEGAL_NAME}}'` stehen.
 * Der Build blieb grün; das Formular hätte jede echte Herkunft abgelehnt. Die CSP-Seite
 * desselben Fehlers fängt `checkCspCompleteness` (`vorlagen_platzhalter`).
 *
 * Geprüft wird nur die Großbuchstaben-Form `{{NAME}}` der cw-core-Vorlagen — so trifft
 * der Guard keine Template-Literale (`${…}`) und keine Mustache-Syntax in Kundencode.
 */

const PLATZHALTER = /\{\{[A-Z][A-Z0-9_]*\}\}/g;

/**
 * @param {{ pfad: string, inhalt: string }[]} dateien
 * @returns {{ pfad: string, zeile: number, platzhalter: string }[]}
 */
export function findeVorlagenPlatzhalter(dateien) {
  /** @type {{ pfad: string, zeile: number, platzhalter: string }[]} */
  const befunde = [];
  for (const { pfad, inhalt } of dateien) {
    inhalt.split('\n').forEach((text, i) => {
      for (const m of text.matchAll(PLATZHALTER)) befunde.push({ pfad, zeile: i + 1, platzhalter: m[0] });
    });
  }
  return befunde;
}
