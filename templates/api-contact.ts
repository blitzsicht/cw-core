// Customer-Kontaktformular-Endpoint (Vercel Function).
// Beim Onboarding nach ROOT `/api/contact.ts` kopieren (NICHT src/pages/api/ — die
// Customer-Sites sind output:'static' + Vercel Functions unter /api/). {{DOMAIN}} und
// {{LEGAL_NAME}} ersetzen. Bindet den zentralen cw-core-Handler ein.
//
// Spam-Defense: Honeypot + Rate-Limit + Origin-Check + Content-Filter (immer aktiv);
// Turnstile optional via TURNSTILE_SECRET_KEY.
//
// Pflicht-Env in Vercel (Production + Preview):
//   RESEND_API_KEY   — account-weiter Resend-Key (blitzsicht.com ist verified Sender)
//   CONTACT_EMAIL    — Empfänger der Lead-Mail (= siteData.contact.email)
// Optional:
//   TURNSTILE_SECRET_KEY (+ PUBLIC_TURNSTILE_SITE_KEY im Build + challenges.cloudflare.com in CSP)
//
// OHNE diese Datei liefert Vercel 404 auf /api/contact → totes Formular. Der CI-Guard
// `validate-form-backend.mjs` erzwingt ihre Existenz.
import { createContactHandler } from '@cw/core/api/contact-handler';

export default createContactHandler({
  allowedOrigins: ['https://{{DOMAIN}}', 'https://www.{{DOMAIN}}'],
  fromName: '{{LEGAL_NAME}}',
  subject: 'Neue Anfrage über {{DOMAIN}}',
});
