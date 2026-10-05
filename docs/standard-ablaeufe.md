# Standard-Abläufe der Kundenseiten

Was ein Besucher auf jeder Blitzsicht-Seite erlebt, wenn er Kontakt aufnimmt — im Erfolgs-
und im Fehlerfall. Die `PROJEKT.md` eines Kunden verweist hierher und nennt nur
**Abweichungen**. Beschrieben ist der **Ist-Zustand** des Codes (Stand cw-core v0.166.0,
05.10.2026), nicht der Wunsch. Wo beides auseinanderfällt, steht ein Issue daneben.

Quellen: `src/components/forms/ContactForm.astro` (Browser), `src/api/contact-handler.js`
(Server). Datenwege: [standard-datenfluss.md](standard-datenfluss.md).

## Kontaktanfrage

| Fall | Was der Besucher sieht | Eingaben | Messung (Plausible) |
|---|---|---|---|
| Erfolg | Formular verschwindet, „Vielen Dank! Wir melden uns innerhalb von 24 Stunden" (`role="status"`, wird vorgelesen) | — | `Form Submit` `status: success` |
| Pflichtfeld leer / Format falsch (Browser) | Native Browser-Meldung am Feld, kein Versand | bleiben | — |
| Server lehnt ab (400, z. B. „Telefonnummer ist ungültig") | Allgemeine Box „Etwas ist schiefgelaufen. Bitte schreiben Sie uns direkt an …" mit `mailto:` | **bleiben**, Button wieder aktiv | `Form Submit` `status: error` |
| Versand scheitert (Resend lehnt ab, nicht erreichbar) | dieselbe Box; der Lead geht mit Hinweis „manuell bearbeiten" an Telegram (falls konfiguriert) | **bleiben** | `Form Submit` `status: error` |
| Zu viele Anfragen (429, Standard 3 je 10 min je IP) | dieselbe Box | bleiben | `status: error` |
| Spam-Verdacht (Honeypot, Inhaltsfilter) | **Erfolgsmeldung** — bewusst, Bots sollen nichts lernen | — | `status: success` |
| Kein JavaScript | Normales HTML-POST an den Endpoint; die Antwort ist die rohe JSON-Antwort des Servers (? ungeprüft im Browser) | — | — |
| Kein Formular-Backend konfiguriert | Statt Formular: „Kontaktieren Sie uns direkt per E-Mail" + Adresse | — | — |
| Besucher verlässt die Seite mitten im Ausfüllen | — | — | `Form Abandoned` |

### Bekannte Lücken (Stand 05.10.2026)

- Die konkrete Servermeldung (`error` im JSON) wird **nicht angezeigt**; das Formular liest
  `message`. Der Besucher erfährt nicht, *welches* Feld falsch war. → Issue
  blitzsicht-ops#915 (Servermeldung wird nie angezeigt).
- Die Fehlerbox hat kein `role="alert"`; Screenreader melden den Fehler nicht. → Issue
  blitzsicht-ops#916 (Fehlerbox ohne role=alert).
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
