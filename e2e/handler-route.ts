/**
 * Verbindet den Browser-POST an /api/contact mit dem ECHTEN createContactHandler.
 *
 * examples/ ist statisch und hat keine API-Route. Statt einen Server-Adapter
 * einzuziehen, fängt der Test den Request im Browser ab (page.route) und ruft den
 * Handler im Test-Prozess auf, mit req/res im Vercel-Stil wie in
 * tests/api/contact-handler-rueckruf.test.js. Der Browser-fetch bleibt echt, das
 * Client-Skript in ContactForm.astro läuft also unverändert.
 *
 * Nach außen geht nichts: global.fetch des Test-Prozesses ist ersetzt und zeichnet
 * Resend-, Telegram- und GlitchTip-Aufrufe nur auf.
 */
import type { Page } from '@playwright/test';
// @ts-ignore — JS-Modul ohne Typen, dieselbe Datei, die Kundenrepos importieren
import { createContactHandler } from '../src/api/contact-handler.js';

const ORIGIN = `http://localhost:${Number(process.env.PORT ?? 4322)}`;

const basis = {
  allowedOrigins: [ORIGIN],
  fromName: 'Beispiel GmbH',
  subject: 'Neue Anfrage (E2E)',
  // Alle Tests laufen von derselben IP; der Rate-Limit ist hier nicht Prüfgegenstand.
  rateLimitMax: 1000,
};

export const ENDPOINTS = {
  /** Wie ein Kunde mit Rückruf- und Empfehlungsformular (allowRueckruf/allowEmpfehlung). */
  freigeschaltet: createContactHandler({ ...basis, allowRueckruf: true, allowEmpfehlung: true }),
  /** Wie ein Kunden-Endpoint, bei dem das Opt-in vergessen wurde. */
  ohneOptIn: createContactHandler({ ...basis }),
};

export type Aufzeichnung = {
  requests: Array<{ body: Record<string, unknown>; status: number; antwort: unknown }>;
  resend: Array<Record<string, unknown>>;
  telegram: Array<Record<string, unknown>>;
};

const ENV = {
  RESEND_API_KEY: 'fake',
  CONTACT_EMAIL: 'info@example.org',
  TELEGRAM_BOT_TOKEN: 'fake-token',
  TELEGRAM_CHAT_ID: '123',
  GLITCHTIP_DSN: 'https://k@errors.example/1',
};

/** Hängt den Handler an /api/contact und liefert die Aufzeichnung zurück. */
export async function verbinde(page: Page, handler: (req: any, res: any) => Promise<void>): Promise<Aufzeichnung> {
  const auf: Aufzeichnung = { requests: [], resend: [], telegram: [] };

  await page.route('**/api/contact', async (route) => {
    const r = route.request();
    const body = JSON.parse(r.postData() ?? '{}');
    const headers = await r.allHeaders();

    const gemerkt = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
    const turnstile = process.env.TURNSTILE_SECRET_KEY;
    Object.assign(process.env, ENV);
    delete process.env.TURNSTILE_SECRET_KEY;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
      const u = String(url);
      const payload = init?.body ? safeJson(String(init.body)) : null;
      if (u.includes('resend.com')) auf.resend.push(payload);
      if (u.includes('telegram.org')) auf.telegram.push(payload);
      return { ok: true, status: 200, text: async () => 'OK', json: async () => ({ success: true, id: 'e2e' }) };
    }) as typeof fetch;

    let status = 0;
    let antwort: unknown = null;
    const res = {
      status(code: number) { status = code; return this; },
      json(p: unknown) { antwort = p; return this; },
      setHeader() { return this; },
      end() { return this; },
    };
    try {
      await handler({ method: r.method(), headers, body, socket: { remoteAddress: '127.0.0.1' } }, res);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [k, v] of Object.entries(gemerkt)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      if (turnstile !== undefined) process.env.TURNSTILE_SECRET_KEY = turnstile;
    }

    auf.requests.push({ body, status, antwort });
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(antwort ?? {}) });
  });

  return auf;
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return { raw: s }; }
}
