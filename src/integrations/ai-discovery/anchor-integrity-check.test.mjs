import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkAnchorIntegrity,
  zaehleAnkerNachTabelle,
  zaehleNamenloseAnker,
} from './anchor-integrity-check.js';

// Wörtlich aus dem Build von customer-blitzsicht/agb/sla vom 27.08.2026 — nicht
// nachgebaut, sonst prüfte der Test eine Erfindung.
const KAPUTT =
  '<td>Telefonische Eskalation an Inhaber: <a href="tel:+491737215679">+49 173 7215679</a></td> ' +
  '</tr> </tbody> </table><a href="tel:+491737215679"> <p class="legal-updated">Stand: 10. Mai 2026 · Version 1.0.</p> ' +
  '</a></div><a href="tel:+491737215679"></a><a href="tel:+491737215679"></a>';

// Dieselbe Stelle nach der <span>-Hülle.
const HEIL =
  '<td>Telefonische Eskalation an Inhaber: <span><a href="tel:+491737215679">+49 173 7215679</a></span></td> ' +
  '</tr> </tbody> </table> <p class="legal-updated">Stand: 10. Mai 2026 · Version 1.0.</p></div>';

test('GEGENPROBE: der echte kaputte Ausschnitt wird gemeldet', () => {
  const issues = checkAnchorIntegrity([{ page: '/agb/sla/', html: KAPUTT }]);
  const typen = issues.map((i) => i.type).sort();
  assert.deepEqual(typen, ['anchor_reopened_after_table', 'anchor_without_name']);
});

test('derselbe Ausschnitt nach der Reparatur ist sauber', () => {
  assert.deepEqual(checkAnchorIntegrity([{ page: '/agb/sla/', html: HEIL }]), []);
});

test('zaehleAnkerNachTabelle zaehlt genau die Wiedereroeffnungen', () => {
  assert.equal(zaehleAnkerNachTabelle(KAPUTT), 1);
  assert.equal(zaehleAnkerNachTabelle(HEIL), 0);
  assert.equal(zaehleAnkerNachTabelle('</table>\n\n  <a href="/x">Text</a>'), 1);
});

test('ein Link mit Text nach der Tabelle ist trotzdem ein Befund — die Signatur zaehlt', () => {
  // Bewusst so: ein <a> unmittelbar hinter </table> ist im Kunden-Markup nie
  // beabsichtigt, und genau so sah der Schadensfall aus.
  assert.equal(zaehleAnkerNachTabelle('</table><a href="/y">Weiter</a>'), 1);
});

test('namenlose Anker: nur wirklich leere zaehlen', () => {
  assert.equal(zaehleNamenloseAnker('<a href="/x"></a>'), 1);
  assert.equal(zaehleNamenloseAnker('<a href="/x">  </a>'), 1);
  assert.equal(zaehleNamenloseAnker('<a href="/x">&nbsp;</a>'), 1);
  assert.equal(zaehleNamenloseAnker('<a href="/x"><span></span></a>'), 1);
});

test('Icon-Links mit Namen sind in Ordnung', () => {
  assert.equal(zaehleNamenloseAnker('<a href="/x" aria-label="Startseite"></a>'), 0);
  assert.equal(zaehleNamenloseAnker('<a href="/x" aria-labelledby="t1"></a>'), 0);
  assert.equal(zaehleNamenloseAnker('<a href="/x" title="Startseite"></a>'), 0);
  assert.equal(zaehleNamenloseAnker('<a href="/x"><img src="i.svg" alt="Start"></a>'), 0);
  assert.equal(zaehleNamenloseAnker('<a href="/x"><svg></svg></a>'), 0);
  assert.equal(zaehleNamenloseAnker('<a href="/x">Text</a>'), 0);
});

test('"<a" als Text in JSON-LD loest nichts aus', () => {
  const roh = '<script type="application/ld+json">{"t":"</table><a href=\\"x\\"></a>"}</script>';
  assert.deepEqual(checkAnchorIntegrity([{ page: '/x/', html: roh }]), []);
});

test('mehrere Seiten: nur die kaputte wird gemeldet', () => {
  const issues = checkAnchorIntegrity([
    { page: '/a/', html: HEIL },
    { page: '/b/', html: KAPUTT },
  ]);
  assert.equal(new Set(issues.map((i) => i.page)).size, 1);
  assert.equal(issues[0].page, '/b/');
});
