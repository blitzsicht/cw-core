// @ts-check
/**
 * @cw/core/csp — der öffentliche, **laufzeit-neutrale** CSP-Kern.
 *
 * Alles hier ist frei von Node-APIs (kein fs, kein crypto, kein path) und
 * läuft deshalb unverändert in einem Cloudflare-Worker, im Astro-Build und
 * unter node_modules im Customer-CI.
 *
 * Existiert, damit es **eine** Wahrheit über CSP-Matching gibt: der
 * Build-Guard, das CI-Gate und das Prod-Monitoring (cw-uptime) benutzen
 * denselben Code. Eine kopierte Zweitimplementierung würde genau die Drift
 * erzeugen, gegen die dieser Kern gebaut wurde.
 *
 * NICHT hierher exportieren: alles, was `node:*` importiert.
 */
export { parseCsp, tokenHost, checkCspCompleteness, extractCspValuesFromVercelJson } from './csp-check.js';
export { checkResource, findViolations } from './csp-match.js';
export { extractResources, extractCssUrls, parseAttrs } from './html-resources.js';
export { auditHtml, formatFinding } from './csp-audit.js';
