# Befund: ausgelieferte Signaturen nennen die Firma als Geschäftsführer

**Erhoben:** 24.08.2026 · **Behoben im Generator:** v0.127.0
**Entscheidung des Operators (24.08.):** ablegen, **nicht** nachziehen.

## Worum es geht

Bis v0.126.0 schrieb `generate.sh` bei GmbH-Kunden `GmbH · GF: <Firmenname>` in den
Compliance-Block — die Firma als ihren eigenen Geschäftsführer. `legal.representatives`
wurde nur im GbR-Zweig gelesen; der Zweig für GmbH/AG/UG/GmbH & Co. KG griff auf
`legal.owner` zurück, und das ist bei einer GmbH der Firmenname.

§ 35a HGB verlangt die Geschäftsführer namentlich.

Bei zwei Repos fehlte zusätzlich die **Handelsregister-Zeile komplett**, weil
`read-customer-data.py` nur die deutschen Feldnamen (`registerNummer`, `registergericht`)
las und diese Repos die englische SSOT-Form führen.

**Beides ist in v0.127.0 behoben.** Neu erzeugt wurde nur customer-zink-baeckerei — dort
war die Signatur noch nie ausgeliefert.

## Wer es noch trägt

Gemessen am 24.08.2026 über alle Customer-Repos. Alle acht haben `representatives`
gepflegt; der Wert lag also bereit und wurde nur nicht gelesen.

| Repo | steht in der Signatur | müsste stehen | Register |
|---|---|---|---|
| customer-digital-direkt | `Digital-Direkt GmbH` | Markus Steller | HRB 11164 ✅ |
| customer-donau-profi | `Gebäudereinigung Donauprofi GmbH` | Angelika Silberhorn | HRB 11755 ✅ |
| customer-itk-regensburg | `ITK Gebäude- und Industrieservice GmbH` | Angelika Silberhorn, Marc-David Urban | HRB 15215 ✅ |
| customer-mika-elektrotechnik | `Elektrotechnik Mika GmbH` | Kewin Mika | **fehlte ganz** |
| customer-schiller-gartenbau | `Schiller Service GmbH` | Andreas Schiller, Daniel Schiller | HRB 14481 ✅ |
| customer-soleno | `Soleno GmbH` | Nico Pöppl | HRB 19310 ✅ |
| customer-weinkontor-sinzing | `Weinkontor Sinzing GmbH & Co. KG` | Weinkontor Sinzing Verwaltungs GmbH, vertreten durch Stefan Wagner | HRA 5928 ✅ |
| ~~customer-zink-baeckerei~~ | ~~`Zink GmbH Bäckerei und Konditorei`~~ | **erledigt 24.08.** | **erledigt** |

## Warum nicht nachgezogen wird

Sechs der sieben haben ihre Signatur bereits installiert. Ein korrigierter Compliance-Block
bedeutet: neu erzeugen, ausliefern, und **jeden Kunden bitten, die Signatur neu
einzurichten**. Das sind sieben Kundenmails und sieben Kunden, die etwas tun müssen — für
eine Angabe, die niemand beanstandet hat.

Das ist eine Geschäftsentscheidung, kein technisches Versäumnis. Sie wurde bewusst so
getroffen.

## Wenn es doch drankommt

Der Generator ist repariert, es genügt ein Lauf je Kunde:

```bash
cd cw-core && ONLY_CUSTOMER=customer-donau-profi pnpm sig:regenerate
```

Danach den Compliance-Block **lesen**, nicht nur auf „✓" achten — genau das Nicht-Hinsehen
hat den Fehler jahrelang überleben lassen.

**Ein natürlicher Anlass ergibt sich von selbst:** Wer das nächste Mal ohnehin eine neue
Signatur bekommt (neue Person, Namensänderung, Rebranding), erhält die korrigierte Fassung
automatisch. Dann fällt kein Extra-Kontakt an.
