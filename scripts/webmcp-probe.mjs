#!/usr/bin/env node
// @ts-check
/**
 * WebMCP-Probe: welche Agent-Werkzeuge meldet eine Seite in Chrome an — mit welchem Schema?
 *
 * Liest dasselbe aus wie DevTools → Application → WebMCP, aber per CDP und damit
 * wiederholbar. Gegenstück zum Build-Guard `ai-discovery/webmcp-form-check.js`: der
 * bildet Chromes Schema-Regel NACH, dieses Skript misst sie am echten Browser. Weicht
 * das eine vom anderen ab, hat Chrome die Regel geändert — dann den Guard anpassen.
 *
 * Chrome vorher mit Flag starten (eigenes Profil, stört das normale Chrome nicht):
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
 *     --remote-debugging-port=9334 --user-data-dir=/tmp/webmcp-prof \
 *     --enable-features=WebMCPTesting about:blank &
 *
 * Aufruf:
 *   node scripts/webmcp-probe.mjs <url> [--port 9334] [--invoke <tool> '<json>']
 *
 * Exit-Code: 0 = mindestens ein Werkzeug gefunden, 2 = keins (ohne Flag meldet Chrome
 * keins — dann ist `document.modelContext` in der Ausgabe false), 1 = Fehler.
 *
 * ACHTUNG --invoke: füllt das Formular wirklich aus. Abgeschickt wird nur, wenn das
 * Werkzeug `toolautosubmit` trägt — unsere tragen es nie (Guard).
 */
const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--') && /^https?:|^file:/.test(a));
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const port = opt('--port') ?? '9334';
const invoke = opt('--invoke');
const invokeInput = invoke ? args[args.indexOf('--invoke') + 2] ?? '{}' : undefined;
if (!url) {
  console.error('Aufruf: node scripts/webmcp-probe.mjs <url> [--port 9334] [--invoke <tool> \'<json>\']');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ziel;
try {
  ziel = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
} catch {
  console.error(`Kein Chrome mit --remote-debugging-port=${port} erreichbar. Startbefehl steht im Dateikopf.`);
  process.exit(1);
}
const ws = new WebSocket(ziel.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const offen = new Map();
/** @type {any[]} */
const events = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(String(m.data));
  if (msg.id && offen.has(msg.id)) {
    offen.get(msg.id)(msg);
    offen.delete(msg.id);
  } else if (msg.method) events.push(msg);
});
/** @returns {Promise<any>} */
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    offen.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

const schliessen = async (code) => {
  ws.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${ziel.id}`).catch(() => {});
  process.exit(code);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Audits.enable');
const an = await send('WebMCP.enable');
if (an.error) {
  console.error('WebMCP.enable fehlgeschlagen — Chrome zu alt?', JSON.stringify(an.error));
  await schliessen(1);
}
await send('Page.navigate', { url });
await sleep(3000);

const api = await send('Runtime.evaluate', { expression: "'modelContext' in document", returnByValue: true });
console.log(`document.modelContext: ${api.result?.result?.value}`);
const tools = events.filter((e) => e.method === 'WebMCP.toolsAdded').flatMap((e) => e.params.tools);
// Schema aus Sicht der SEITE (document.modelContext.getTools()), nicht aus CDP: Chrome 153
// lässt `inputSchema` im CDP-Event (und damit im DevTools-Panel) komplett weg, sobald eine
// Parameterbeschreibung ein Latin-1-Zeichen enthält (ä, ü, é — auch aus dem Label-Text).
// Gemessen 11.09.2026: "für" → kein Schema, "a…" (U+2026) → Schema da; getTools() liefert
// in beiden Fällen das vollständige Schema. Ohne diesen Umweg sähe jedes deutsche Formular
// parameterlos aus.
const seite = await send('Runtime.evaluate', {
  expression:
    '(async()=>{try{const t=await document.modelContext.getTools();' +
    'return JSON.stringify(t.map(x=>[x.name,x.inputSchema]))}catch(e){return "[]"}})()',
  awaitPromise: true,
  returnByValue: true,
});
/** @type {Map<string, any>} */
const seitenSchema = new Map(
  JSON.parse(seite.result?.result?.value ?? '[]').map(([n, s]) => [n, typeof s === 'string' ? JSON.parse(s) : s]),
);
console.log(`Werkzeuge: ${tools.length}`);
for (const t of tools) {
  const schema = seitenSchema.get(t.name) ?? t.inputSchema;
  if (!t.inputSchema && seitenSchema.has(t.name)) {
    console.log(`\n  (CDP ohne inputSchema — Umlaut-Fehler in Chrome, Schema aus getTools())`);
  }
  const props = schema?.properties ?? {};
  const pflicht = new Set(schema?.required ?? []);
  console.log(`\n■ ${t.name}${t.annotations?.autosubmit ? '  [autosubmit!]' : ''}`);
  console.log(`  ${t.description}`);
  for (const [name, p] of Object.entries(props)) {
    console.log(`  - ${name}${pflicht.has(name) ? ' *' : ''}  (${p.type ?? '?'})  ${p.description ?? '— ohne Beschreibung —'}`);
  }
}
const befunde = events
  .filter((e) => e.method === 'Audits.issueAdded' && JSON.stringify(e.params).includes('ModelContext'))
  .map((e) => e.params.issue.details?.genericIssueDetails?.errorType);
for (const b of new Set(befunde)) console.log(`\nChrome-Issue: ${b} (${befunde.filter((x) => x === b).length}×)`);

if (invoke) {
  const t = tools.find((x) => x.name === invoke);
  if (!t) {
    console.error(`\nWerkzeug "${invoke}" nicht gefunden.`);
    await schliessen(1);
  }
  const r = await send('WebMCP.invokeTool', { frameId: t.frameId, toolName: invoke, input: JSON.parse(invokeInput) });
  console.log(`\nAufruf: ${JSON.stringify(r.result ?? r.error)}`);
  await sleep(2500);
  for (const e of events.filter((x) => x.method === 'WebMCP.toolInvoked' || x.method === 'WebMCP.toolResponded')) {
    console.log(`${e.method}: ${JSON.stringify(e.params)}`);
  }
}
await schliessen(tools.length > 0 ? 0 : 2);
