# Standard-Datenfluss der Kundenseiten

Wohin eine Kontaktanfrage geht, was dabei gespeichert wird und wer sie sieht — für jede
Blitzsicht-Seite mit dem cw-core-Endpoint `api/contact.ts`. Die `PROJEKT.md` eines Kunden
verweist hierher und nennt nur **Abweichungen** (eigenes CRM, Odoo, Buchungssystem,
Kundenportal). Ein eigenes Datenmodell braucht es erst, wenn eine Datenbank des Kunden im
Spiel ist. Ist-Zustand cw-core v0.166.0 (05.10.2026), Quelle `src/api/contact-handler.js`.

Besuchersicht im Erfolgs- und Fehlerfall: [standard-ablaeufe.md](standard-ablaeufe.md).

## Weg einer Anfrage

```
Browser (ContactForm)
  └─ POST JSON → /api/contact  (Vercel Function im Kundenprojekt)
       ├─ Origin-Check, Rate-Limit, Honeypot, Turnstile*, Feldprüfung, Inhaltsfilter
       ├─ Resend → CONTACT_EMAIL (Postfach des Kunden), bcc LEAD_BCC_EMAIL*
       │            reply_to = Adresse des Besuchers
       ├─ Telegram* (Lead-Benachrichtigung; bei Zustellfehler mit Hinweis „manuell bearbeiten")
       ├─ GlitchTip* (Zustellfehler; Spam-Gründe nur mit Turnstile-Secret; keine Inhalte)
       └─ conversion_queue* (Neon) — nur Ads-Sites, nur mit Marketing-Einwilligung und Klick-ID
```

`*` = optional, aktiv nur mit der jeweiligen Env-Variable. Fehlt sie, entfällt der Zweig
still; der Mailversand bleibt davon unberührt.

## Was wo liegt

| Ort | Inhalt | Wer sieht es | Wie lange |
|---|---|---|---|
| Postfach `CONTACT_EMAIL` | Komplette Anfrage | Kunde | Sache des Kunden |
| bcc `LEAD_BCC_EMAIL` | Komplette Anfrage | Blitzsicht | Postfach-Aufbewahrung Blitzsicht |
| Resend | Mail-Metadaten und -Inhalt | Blitzsicht (Konto) | Resend-Log-Aufbewahrung |
| Telegram | Name, Kontaktdaten, Nachricht | Chat aus `TELEGRAM_CHAT_ID` | Chat-Verlauf |
| GlitchTip | Zustellfehler, nicht freigeschaltete Formulare; Spam-Grund nur mit `TURNSTILE_SECRET_KEY` — **kein** Anfrageinhalt | Blitzsicht | GlitchTip-Aufbewahrung |
| Upstash Redis* | IP-Zähler fürs Rate-Limit | — | Fensterlänge (Standard 10 min) |
| `conversion_queue`* | Klick-ID, Zeitpunkt, utm_*, Einwilligungs-Version | Blitzsicht (cw-ads) | bis zum Upload |
| Plausible | Ereignisse `Form Start`/`Form Submit`/`Form Abandoned` mit Formularart und Status, **keine** Feldinhalte | Blitzsicht, ggf. Kunde | Plausible-Aufbewahrung |
| Vercel-Logs | IP bei Honeypot-/Spam-Treffern, Fehler — keine Anfrageinhalte | Blitzsicht | Vercel-Log-Aufbewahrung |

**Keine eigene Datenbank:** Anfragen werden nicht dauerhaft auf Blitzsicht-Seite
gespeichert, außer als Mail-Kopie (bcc) und Telegram-Nachricht. Das Postfach des Kunden
ist der Ort der Wahrheit.

## Zustellfehler

Lehnt Resend ab oder ist nicht erreichbar, bekommt der Besucher die Fehlerbox, und der
Lead geht mit Hinweis „per Mail nicht zugestellt, bitte manuell bearbeiten" an Telegram
und als Fehler an GlitchTip. Ohne Telegram-Env ist er dann nur noch in GlitchTip als
Fehler sichtbar, **ohne Inhalt** — und damit für den Kunden verloren.

Rückruf- oder Empfehlungsformular ohne Freischaltung im Endpoint (`allowRueckruf`/
`allowEmpfehlung`): Der Besucher bekommt 400, die Anfrage geht als Zustellfehler an Telegram
und als Fehler (ohne Inhalt) an GlitchTip — ohne Telegram-Env ist der Inhalt verloren.

## Für die PROJEKT.md

Pro Kunde festhalten, nicht neu beschreiben:

- Empfängerpostfach (`CONTACT_EMAIL`) — vom Kunden bestätigt, nie geraten
- welche optionalen Zweige aktiv sind (Telegram, Turnstile, bcc, conversion_queue)
- jede Abweichung vom Weg oben (z. B. Weiterleitung an Odoo-CRM, Terminbuchung über Dritte)

Datenschutzerklärung und AV-Verträge müssen zu den aktiven Zweigen passen; das prüft der
Rechtstext-Workflow, nicht dieses Dokument.
