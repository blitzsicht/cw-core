# Standard-Abläufe der Kundenseiten

Was ein Besucher auf jeder Blitzsicht-Seite erlebt, wenn er Kontakt aufnimmt — im Erfolgs-
und im Fehlerfall. Die `PROJEKT.md` eines Kunden verweist hierher und nennt nur
**Abweichungen**. Beschrieben ist der **Ist-Zustand** des Codes (Stand cw-core v0.167.0,
05.10.2026), nicht der Wunsch. Wo beides auseinanderfällt, steht ein Issue daneben.

Quellen: `src/components/forms/ContactForm.astro` (Browser), `src/api/contact-handler.js`
(Server). Datenwege: [standard-datenfluss.md](standard-datenfluss.md).

## Kontaktanfrage

| Fall | Was der Besucher sieht | Eingaben | Messung (Plausible) |
|---|---|---|---|
| Erfolg | Formular verschwindet, „Vielen Dank! Wir melden uns innerhalb von 24 Stunden" (`role="status"`, wird vorgelesen) | — | `Form Submit` `status: success` |
| Pflichtfeld leer / Format falsch (Browser) | Native Browser-Meldung am Feld, kein Versand | bleiben | — |
| Server lehnt ab (400, z. B. „Telefonnummer ist ungültig") | Fehlerbox mit **der Meldung des Servers**, darunter „Etwas ist schiefgelaufen. Bitte schreiben Sie uns direkt an …" mit `mailto:`; wird vorgelesen (`role="alert"`) | **bleiben**, Button wieder aktiv | `Form Submit` `status: error` |
| Versand scheitert (Resend lehnt ab → 400 „Email konnte nicht gesendet werden.“; nicht erreichbar → 500 ohne Meldung) | Fehlerbox, bei 500 nur der allgemeine Text; der Lead geht mit Hinweis „manuell bearbeiten" an Telegram (falls konfiguriert) | **bleiben** | `Form Submit` `status: error` |
| Zu viele Anfragen (429, Standard 3 je 10 min je IP) | Fehlerbox mit „Zu viele Anfragen. Bitte später erneut versuchen.“ | bleiben | `status: error` |
| Spam-Verdacht (Honeypot, Inhaltsfilter) | **Erfolgsmeldung** — bewusst, Bots sollen nichts lernen | — | `status: success` |
| Kein JavaScript | Normales HTML-POST an den Endpoint; die Antwort ist die rohe JSON-Antwort des Servers (? ungeprüft im Browser) | — | — |
| Kein Formular-Backend konfiguriert | Statt Formular: „Kontaktieren Sie uns direkt per E-Mail" + Adresse | — | — |
| Besucher verlässt die Seite mitten im Ausfüllen | — | — | `Form Abandoned` |

Angezeigt wird die Servermeldung nur bei 400 und 429 des eigenen Endpoints — dort ist sie
für Besucher formuliert. 403 (fremde Herkunft), 5xx und Meldungen von Web3Forms (englisch,
Konfiguration) bleiben beim allgemeinen Text. Geprüft in `e2e/formulare.spec.ts`.

### Bekannte Lücken (Stand 05.10.2026)

- Behoben in v0.167.0: Servermeldung wird angezeigt (blitzsicht-ops#915), Fehlerbox mit
  `role="alert"` (blitzsicht-ops#916).
- Im Spam-Fall sieht auch ein echter Mensch, dessen Text den Filter trifft, „Vielen Dank" —
  die Anfrage kommt nie an. Mit `TURNSTILE_SECRET_KEY` meldet der Handler den Grund an
  GlitchTip; ohne Turnstile bleibt es still.

## Bot-Schutz

Turnstile lädt lazy: sobald das Widget sichtbar wird oder das Formular den Fokus bekommt. Ohne `TURNSTILE_SECRET_KEY`
wird die Prüfung übersprungen; Origin-Check, Rate-Limit, Honeypot und Inhaltsfilter
laufen immer. Ein Build ohne Site-Key warnt im Deploy-Log.

## Formular-Varianten

`formType`: `contact` (Standard), `audit`, `bewerbung`, `waitlist`, `updates`, `rueckruf`,
`empfehlung`. Rückruf und Empfehlung brauchen das Opt-in im Endpoint
(`allowRueckruf`/`allowEmpfehlung`), sonst lehnt der Server mit 400 ab — der Besucher
sieht die allgemeine Fehlerbox. Erfolgstexte je Variante stehen in `ContactForm.astro`.

## Als Abnahmekriterium

Im Intake (`projekt.abnahme`) prüfbar formulieren, z. B.:

| Kriterium | Prüfung |
|---|---|
| Formular-Backend vorhanden, Origins stimmen (mit `CONTACT_EMAIL` im Env zusätzlich: Empfänger ist nicht Blitzsicht) | `node node_modules/@cw/core/scripts/validate-form-backend.mjs` |
| Echte Testanfrage kommt an, Fehlerfall zeigt Mail-Ausweg, Eingaben bleiben | manuell (Gate, Abschnitt D) |
