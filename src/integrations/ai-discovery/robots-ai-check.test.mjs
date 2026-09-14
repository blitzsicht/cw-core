import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkRobotsAiPolicy, robotsGruppen } from './robots-ai-check.js';

const VORLAGE = new URL('../../templates/robots.txt.template', import.meta.url);

// Die Vorlage bis v0.151.1 (Auszug ab der ersten Gruppe, wörtlich). Sie sperrte
// MistralAI-User und Meta-ExternalFetcher — zwei Abrufer im Auftrag eines Nutzers —
// unter der Überschrift „Training-Only-Bots“, und trug kein Content-Signal.
const ALT = `
User-agent: *
Allow: /
Disallow: /danke/

User-agent: OAI-SearchBot
Allow: /
Disallow: /danke/

User-agent: ChatGPT-User
Allow: /
Disallow: /danke/

User-agent: Claude-SearchBot
Allow: /
Disallow: /danke/

User-agent: Claude-User
Allow: /
Disallow: /danke/

User-agent: PerplexityBot
Allow: /
Disallow: /danke/

User-agent: Perplexity-User
Allow: /
Disallow: /danke/

User-agent: DuckAssistBot
Allow: /
Disallow: /danke/

User-agent: Google-Extended
Allow: /
Disallow: /danke/

# --- Training-Only-Bots (BLOCKIERT) ---
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: Meta-ExternalAgent
Disallow: /

User-agent: Meta-ExternalFetcher
Disallow: /

User-agent: Amazonbot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: cohere-ai
Disallow: /

User-agent: MistralAI-User
Disallow: /

User-agent: xAI-Bot
Disallow: /

Sitemap: https://DOMAIN/sitemap-index.xml
`;

const typen = (issues) => issues.map((i) => i.type).sort();

test('GEGENPROBE: die alte Vorlage wird gemeldet — zwei Abruf-Bots gesperrt, kein Content-Signal', () => {
  const issues = checkRobotsAiPolicy(ALT);
  const gesperrt = issues.filter((i) => i.type === 'bot_blocked').map((i) => i.bot).sort();
  assert.deepEqual(gesperrt, ['Meta-ExternalFetcher', 'MistralAI-User']);
  assert.ok(issues.some((i) => i.type === 'content_signal_missing'));
  assert.ok(issues.every((i) => i.type !== 'wildcard_blocked'));
});

test('die neue Vorlage ist sauber', () => {
  const inhalt = readFileSync(VORLAGE, 'utf-8').replace('DOMAIN', 'example.com');
  assert.deepEqual(checkRobotsAiPolicy(inhalt), []);
});

test('neue Vorlage: Bytespider ist die einzige Komplettsperre', () => {
  const inhalt = readFileSync(VORLAGE, 'utf-8');
  const gesperrt = robotsGruppen(inhalt)
    .filter((g) => g.rules.some((r) => r.key === 'disallow' && r.value === '/'))
    .flatMap((g) => g.agents);
  assert.deepEqual(gesperrt, ['bytespider']);
});

test('User-agent: * mit Disallow: / → ein wildcard_blocked, kein Rauschen je Bot', () => {
  const issues = checkRobotsAiPolicy('User-agent: *\nDisallow: /\n');
  assert.deepEqual(typen(issues), ['wildcard_blocked']);
});

test('mehrere User-agent-Zeilen bilden eine Gruppe', () => {
  const issues = checkRobotsAiPolicy(
    'User-agent: *\nAllow: /\nContent-Signal: search=yes\n\nUser-agent: GPTBot\nUser-agent: ChatGPT-User\nDisallow: /\n',
  );
  // GPTBot ist Trainings-Bot → keine Meldung; ChatGPT-User steckt in derselben Gruppe.
  assert.deepEqual(issues.map((i) => i.bot), ['ChatGPT-User']);
});

test('Allow: / neben Disallow: / sperrt nicht (RFC 9309: Allow gewinnt)', () => {
  const issues = checkRobotsAiPolicy('User-agent: Claude-User\nAllow: /\nDisallow: /\nContent-Signal: search=yes\n');
  assert.deepEqual(issues, []);
});

test('Disallow auf Unterpfade ist keine Komplettsperre', () => {
  const issues = checkRobotsAiPolicy('User-agent: *\nDisallow: /danke/\nDisallow: /email/\nContent-Signal: search=yes\n');
  assert.deepEqual(issues, []);
});

test('Groß-/Kleinschreibung und Kommentare werden ignoriert', () => {
  const issues = checkRobotsAiPolicy('user-agent: claude-user # Nutzerabruf\nDISALLOW: /   # weg\n');
  assert.deepEqual(issues.filter((i) => i.severity === 'error').map((i) => i.bot), ['Claude-User']);
});

test('Content-Signal nur in *, KI-Gruppe ohne → Hinweis nennt die Gruppe', () => {
  const issues = checkRobotsAiPolicy(
    'User-agent: *\nAllow: /\nContent-Signal: search=yes\n\nUser-agent: OAI-SearchBot\nAllow: /\n',
  );
  assert.deepEqual(typen(issues), ['content_signal_missing']);
  assert.match(issues[0].detail, /oai-searchbot/);
});

test('leere Datei → nur der Content-Signal-Hinweis', () => {
  assert.deepEqual(typen(checkRobotsAiPolicy('')), ['content_signal_missing']);
});
