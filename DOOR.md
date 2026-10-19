# DOOR.md

Jedes Repo trägt seine Tür. Ohne ausgefüllte DOOR.md legt `cw-new-repo` kein Repo an, und captain-daily meldet das Repo jeden Morgen.

| Feld | Wert |
|---|---|
| Repo | `cw-core` |
| Linie | 2 Blitzsicht Web |
| Frage 1: Passt es in Paket 1 oder 2? | ja (Komponentenbibliothek aller Kundenseiten) |
| Frage 2: Schon für mich selbst gebaut? | ja (eigener Stack, auch für blitzsicht.com) |
| Frage 3: Mittelstand, unklares Problem, Budget? | nein (Bibliothek) |
| Frage 4: Dient es Siluri direkt? | nein (Blitzsicht-Kundenseiten) |
| Add-on zu | — |
| Parkplatz-Issue | — Bestand vor der Tür (angelegt vor 15.10.2026) |
| Owner | Johannes |
| Angelegt | 2026-04-15 |
| Review | 2027-01-15 |
| Kill-Kriterium | < 5 Kundenseiten auf einem cw-core-Tag aus Q4 2026 am 2027-01-15, sonst Review |
| Modell-Routing | anthropic + deepseek-fallback (nur Code ohne Daten) |

Regel: Mindestens eine der vier Fragen ist „ja", sonst gehört das Repo nicht angelegt. Linie 1 erfordert Frage 4 = ja und ein ausgefülltes „Add-on zu".
