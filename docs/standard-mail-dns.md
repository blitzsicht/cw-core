# Standard Mail-DNS der Kundendomains

Wie Blitzsicht den Mailversand einer Kundendomain absichert (SPF, DKIM, DMARC, MTA-STS,
TLS-RPT), in welcher Reihenfolge und **wohin die Berichte gehen**. Gilt für jede Domain, deren
DNS wir verwalten („Mail-Hardening“ in der Paket-Matrix,
`customer-websites/docs/06-paket-leistungs-matrix.md`). Die `PROJEKT.md` eines Kunden nennt
nur **Abweichungen**. Entschieden am 07.11.2026 (Operator), erster Fall: spedition-steller.de.

## Regel: Berichte gehen an Blitzsicht

| Eintrag | Wert |
|---|---|
| DMARC `rua` | `mailto:dmarc-reports@blitzsicht.com` |
| TLS-RPT `rua` | `mailto:dmarc-reports@blitzsicht.com` |
| DMARC `ruf` | **nicht setzen** |

- **Postfach:** `dmarc-reports@blitzsicht.com` ist das bestehende Berichtspostfach der Flotte
  (u. a. allstargirls.de). Es liest die App `dmarc-reports-reader`, nur dieses Postfach
  (Handoff customer-zink-baeckerei 2026-09-29). Keine zweite Adresse anlegen.
- **Der Kunde bekommt keine Berichtsmails.** Die Berichte sind XML-Dateien, er kann damit
  nichts anfangen, und wir werten sie ohnehin aus. Ein Postfach beim Kunden, das niemand liest,
  bringt nichts.
- **Kein `ruf`.** Fehlerberichte (forensic) können Kopfzeilen und Inhalte einzelner Mails
  enthalten, also personenbezogene Daten Dritter. Die Sammelberichte (`rua`) enthalten nur
  sendende IP-Adressen, Mengen und Prüfergebnisse.
- **Freigabe für Fremdempfang (Pflicht, RFC 7489 §7.1).** Ein `rua` in einer fremden Domain
  werten Berichtssender nur aus, wenn die empfangende Domain zustimmt. Je Kundendomain gehört
  deshalb in die Zone **blitzsicht.com**:

  ```
  <kundendomain>._report._dmarc.blitzsicht.com.  TXT  "v=DMARC1"
  ```

  Ohne diesen Eintrag kommen von großen Anbietern keine DMARC-Berichte an, ohne Fehlermeldung.
  TLS-RPT (RFC 8460) braucht keine solche Freigabe.
- Verlässt ein Kunde Blitzsicht, werden `rua` beider Einträge auf seine Adresse umgestellt und
  der Freigabe-Eintrag in blitzsicht.com gelöscht.

## Reihenfolge

1. **SPF prüfen, nicht raten.** Welche Systeme verschicken als `@kundendomain` (Mailserver,
   Branchensoftware, Scanner, Formulare, Newsletter)? Beim IT-Betreuer des Kunden erfragen.
   SPF erst danach anpassen.
2. **DKIM.** Die Selektoren kommen aus dem Mailsystem des Kunden, nie aus einem
   Muster abgeleitet. M365: `Get-DkimSigningConfig -Identity <domain> |
   Format-List Selector1CNAME,Selector2CNAME` oder das Defender-Portal. Erst die CNAMEs
   eintragen, dann im Mailsystem einschalten.
3. **DMARC mit `p=none`.** Nur beobachten, keine Mail wird abgewiesen:
   `v=DMARC1; p=none; rua=mailto:dmarc-reports@blitzsicht.com` plus den Freigabe-Eintrag oben.
4. **MTA-STS mit `mode: testing` und TLS-RPT.** Über cw-mta-sts. Reihenfolge laut dessen
   `CLAUDE.md`: Route und Deploy, Policy abrufen, `_smtp._tls`-TXT, `_mta-sts`-TXT **zuletzt**.
   Ohne TLS-RPT meldet `testing` seine Fehler nirgendwohin.
5. **Nach mindestens vier Wochen sauberer Berichte verschärfen:** DMARC auf `p=quarantine`,
   MTA-STS auf `enforce`. Vorher alle MX samt STARTTLS-Zertifikat prüfen (cw-mta-sts
   `CLAUDE.md`, „Häufige Gotchas“).

## Was der Kunde erfährt

Eine kurze Info-Mail an den Ansprechpartner und den IT-Betreuer, über falzmarke:
was eingerichtet ist, dass sich für sie im Alltag nichts ändert, dass Berichte an uns gehen
und dass sie uns melden, wenn ein neues System Mails in ihrem Namen verschicken soll (sonst
fällt es nach der Verschärfung durch). Landet trotzdem eine Berichtsmail beim Kunden, kann er
sie löschen oder an uns weiterleiten.
