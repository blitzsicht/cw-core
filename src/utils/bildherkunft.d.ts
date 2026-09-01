/**
 * Typen zu `bildherkunft.js`.
 *
 * Die Implementierung bleibt bewusst reines `.js` — sie wird per `node:test` geprüft
 * und aus plain-node-Kontexten importiert, wo ein `.ts`-Import nicht ginge. Ohne diese
 * Deklarationsdatei bekommt jeder Kunde, der die Regeln in `page-config.ts` pflegt,
 * `astro check`-Fehler ts7016 („implicitly has an 'any' type").
 *
 * Anders als bei `copyright.d.ts` sind die Werte hier **eng typisiert**: Die zulässigen
 * Herkunfts- und Deepfake-Angaben sind abgeschlossen, und ein Tippfehler in einer
 * Kunden-`site-data.ts` soll beim `astro check` auffallen und nicht erst, wenn der
 * Guard das Bild als `ungeklaert` meldet.
 */

/** Herkunft eines Bildes. `ungeklaert` ist der dritte Zustand, nicht grün. */
export type Herkunft = 'mensch' | 'ki-erzeugt' | 'ki-veraendert' | 'ungeklaert';

/** Deepfake-Einordnung nach Art. 3 Nr. 60 AI Act. */
export type DeepfakeEinordnung = 'ja' | 'nein' | 'ungeklaert';

/**
 * Eine Deklarationsregel. Sie adressiert ihr Bild auf einem von zwei Wegen — genau einer
 * muss gesetzt sein:
 *
 * - **`pathPrefix`** für Bilder aus `public/`. Matcht gegen den dist-relativen Pfad, der
 *   längste Treffer gewinnt; Ausnahmen innerhalb eines Ordners sind damit möglich.
 * - **`stem`** für Bilder aus `src/assets/`. Die Astro-Assetpipeline hängt einen
 *   Content-Hash an (`hero.webp` → `_astro/hero.Bng-bGX1.webp`), ein Pfad-Präfix träfe sie
 *   nie. Der Stem ist der Dateiname bis zum ersten Punkt — dieselbe Mechanik wie in
 *   `descForFile` (geotag-core.js). Er muss innerhalb einer Site eindeutig sein.
 *
 * Passen beide auf dasselbe Bild, gewinnt `pathPrefix`: der konkrete Pfad ist spezifischer
 * als der bloße Dateiname.
 *
 * `deepfake` ist nur bei `herkunft: 'ki-erzeugt' | 'ki-veraendert'` sinnvoll; wird es
 * auf `'ja'` oder `'nein'` gesetzt, ist `begruendung` Pflicht — sie ist der Nachweis.
 */
export type BildHerkunftRegel = {
  herkunft: Herkunft;
  deepfake?: DeepfakeEinordnung;
  begruendung?: string;
} & ({ pathPrefix: string; stem?: never } | { stem: string; pathPrefix?: never });

/** Aufgelöste Herkunft für ein einzelnes Bild. */
export interface BildHerkunftErgebnis {
  herkunft: Herkunft;
  deepfake: DeepfakeEinordnung;
  /** Nachweis zur Deepfake-Einordnung; nur gesetzt, wenn sie entschieden ist. */
  begruendung: string | null;
  /**
   * Woher das Ergebnis kommt: der `pathPrefix` der greifenden Regel, oder `stem:<name>`
   * bei einer Stem-Regel. Null, wenn keine Regel passte.
   */
  quelle: string | null;
  /** Klartext-Befund, wenn die Deklaration fehlt, unvollständig oder widersprüchlich ist. */
  problem: string | null;
}

/** Zulässige Herkunftsangaben, in Deklarationsreihenfolge. */
export const HERKUNFT_WERTE: readonly Herkunft[];

/** Zulässige Deepfake-Einordnungen. */
export const DEEPFAKE_WERTE: readonly DeepfakeEinordnung[];

/**
 * Der Wortlaut der Offenlegung, je Herkunft — die einzige Fassung im Repo.
 * Verwender: `AiLabel.astro` (Badge im DOM) und `og-alt.js` (`og:image:alt`).
 */
export const OFFENLEGUNG_TEXT: Record<'ki-erzeugt' | 'ki-veraendert', string>;

/**
 * Alle Regeln eines site-data prüfen, unabhängig davon, ob ein Bild sie trifft.
 * Befundform wie `ImpressumIssue` (`ai-discovery/index.ts`).
 */
export function pruefeBildHerkunftRegeln(data: any): Array<{ field: string; detail: string }>;

/**
 * Herkunft für ein einzelnes Bild auflösen. Ohne passende Regel: `ungeklaert` —
 * es gibt bewusst keinen Site-Default im Code.
 */
export function resolveBildHerkunft(data: any, relPath: string): BildHerkunftErgebnis;

/**
 * Löst dieses Bild die Kennzeichnungspflicht aus Art. 50 Abs. 4 UAbs. 1 aus?
 * Nur wenn beide Merkmale zusammenkommen: KI-Herkunft **und** `deepfake: 'ja'`.
 *
 * Der Parameter ist bewusst auf die beiden gelesenen Felder verengt statt auf das ganze
 * `BildHerkunftErgebnis`: Aufrufer, die die Einordnung aus einer anderen Quelle haben
 * (Prüfskript, Komponenten-Prop), sollen sie nicht um `quelle`/`problem`/`begruendung`
 * ergänzen müssen, nur um die Frage stellen zu dürfen.
 */
export function istKennzeichnungspflichtig(
  ergebnis: Pick<BildHerkunftErgebnis, 'herkunft' | 'deepfake'> | null | undefined,
): boolean;
