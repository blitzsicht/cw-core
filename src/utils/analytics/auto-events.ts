/**
 * auto-events.ts — die EINE Quelle für automatische Plausible-Events.
 *
 * Warum es diese Datei gibt
 * -------------------------
 * Derselbe Event-Satz existierte zweimal: einmal inline in `BaseLayout.astro`
 * (Modus `inline`, Default, 8 Kundensites) und einmal in
 * `components/analytics/PlausibleEvents.astro` (Modus `full`, 6 Kundensites).
 * Beide fingen `[data-cta]` ab, beide zählten Scroll-Tiefe, beide hörten auf
 * Formular-Absendungen — und beide waren über Monate auseinandergelaufen:
 *
 *   - `Time on Page` gab es nur im inline-Zweig.
 *   - Phone/Mail/WhatsApp sendeten unterschiedliche Properties
 *     (`number`/`address` gegen `location`).
 *   - Der full-Zweig band Listener per `querySelectorAll` an die zum
 *     Hydrations-Zeitpunkt vorhandenen Elemente und verpasste dadurch alles,
 *     was später ins DOM kam. Der inline-Zweig delegierte und hatte das Problem nicht.
 *   - Die Scroll-Messung lief nur im full-Zweig durch `requestAnimationFrame`.
 *
 * Jede dieser Abweichungen war ein stiller Messfehler bei genau einer Hälfte der
 * Flotte. Zwei Fassungen derselben Funktion laufen zwangsläufig auseinander —
 * deshalb gibt es sie jetzt nur noch einmal.
 *
 * Was beim Zusammenführen gewonnen hat, und warum
 * -----------------------------------------------
 *   Delegation statt querySelectorAll — erfasst auch nachgeladene Elemente.
 *   Properties additiv vereinigt — `location` UND `number`/`address`, damit
 *     keine der beiden bestehenden Auswertungen etwas verliert.
 *   Scroll mit rAF — misst dasselbe, ohne bei jedem Scroll-Ereignis das Layout
 *     zu erzwingen.
 *   `Time on Page` gilt jetzt für beide Modi.
 *
 * Einzige verbliebene Option ist `paidVisit` — und sie gatet bewusst nur das
 * Event, nicht das Sichern der Klick-Kennzeichen. Das lief vorher zusammen, und
 * genau daraus entstand eine zweite, stillere Lücke: Bei den inline-Kunden wurden
 * gclid/utm nie gesichert. Dort schrieb sie einzig `ContactForm.astro`, und zwar
 * erst beim Laden der Kontaktseite — zu einem Zeitpunkt, an dem das gclid längst
 * nicht mehr in der URL steht. Wer über eine Anzeige auf der Startseite landete
 * und dann weiternavigierte, verlor seine Attribution vollständig.
 */

import { track } from './track';

export interface AutoEventOptions {
  /**
   * `Paid Visit` feuern, wenn erstmals ein Klick-Kennzeichen eintrifft.
   *
   * Gated, weil `Paid Visit` ein PAID_GOAL ist und nur bei Ads-Kunden
   * provisioniert wird — feuerte es überall, meldete `eventsWithoutGoal()` in
   * plausible-reconcile.mjs bei jeder anderen Site eine Lücke.
   *
   * Das *Sichern* der Klick-Kennzeichen hängt bewusst NICHT an dieser Option,
   * siehe `initAttribution`.
   */
  paidVisit?: boolean;
}

/** Namensraum für die persistierten Attributions-Werte. */
const ATTR_PREFIX = 'cw_attr_';

/**
 * Muss mit ATTRIBUTION_KEYS in `api/contact-handler.js` übereinstimmen — die
 * ContactForm liest diese Werte beim Absenden in Hidden-Felder.
 */
const AD_KEYS = [
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'fbclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid'] as const;

const SCROLL_MILESTONES = [25, 50, 75, 100] as const;
const TIME_MILESTONES: ReadonlyArray<readonly [number, string]> = [
  [30_000, '30s'],
  [120_000, '2min'],
  [300_000, '5min'],
];

const WHATSAPP_RE = /(^|\/\/)(wa\.me|api\.whatsapp\.com)\//;

/**
 * Sektions-Auflösung: explizites `data-location`, sonst die nächste
 * `[data-section]` (der Footer trägt z. B. `data-section="footer"`), sonst
 * 'unknown'.
 */
function sectionLoc(el: Element): string {
  const withDataset = el as HTMLElement;
  return (
    withDataset.dataset?.location ??
    el.closest('[data-section]')?.getAttribute('data-section') ??
    'unknown'
  );
}

/**
 * Klick-Kennzeichen und utm-Parameter aus der URL sichern.
 *
 * Laeuft IMMER, in beiden Tracking-Modi — und das ist eine bewusste Korrektur:
 * Bis v0.154.0 sicherte nur der full-Zweig diese Werte. Bei den inline-Kunden
 * schrieb sie einzig `ContactForm.astro` (Zeile 428), und zwar erst beim Laden
 * der Kontaktseite. Zu diesem Zeitpunkt steht das gclid laengst nicht mehr in
 * der URL: Wer ueber eine Anzeige auf der Startseite landet und dann zum
 * Kontaktformular navigiert, verlor seine Attribution vollstaendig.
 *
 * Das Sichern selbst ist harmlos — cookielos, kein Consent noetig, kein Event.
 * Nur das daraus abgeleitete `Paid Visit` haengt an einer Option.
 */
function initAttribution(paidVisit: boolean): void {
  try {
    const params = new URLSearchParams(window.location.search);
    let newClickId = false;
    for (const k of AD_KEYS) {
      const v = params.get(k);
      if (!v) continue;
      if ((CLICK_IDS as readonly string[]).includes(k) && !sessionStorage.getItem(ATTR_PREFIX + k)) {
        newClickId = true;
      }
      sessionStorage.setItem(ATTR_PREFIX + k, v.slice(0, 512));
    }
    // Nur beim erstmaligen Eintritt eines Klick-Kennzeichens — sonst zählte
    // jede Folgeseite derselben Sitzung als weiterer bezahlter Besuch.
    if (newClickId && paidVisit) {
      track('Paid Visit', {
        source: params.get('utm_source') ?? 'ads',
        campaign: params.get('utm_campaign') ?? 'unknown',
      });
    }
  } catch {
    /* sessionStorage oder URL nicht verfügbar — Attribution still überspringen */
  }
}

/**
 * Eigen-Marken-Backlink (Footer „Erstellt von Blitzsicht"): die servende
 * Kundendomain als utm_source ergänzen, damit blitzsicht.com sieht, von welcher
 * Kundenseite der Klick kam.
 */
function initBrandBacklink(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[data-brand-backlink]').forEach((el) => {
    try {
      const u = new URL(el.href);
      if (!u.searchParams.has('utm_source')) {
        u.searchParams.set('utm_source', window.location.hostname);
        el.href = u.toString();
      }
    } catch {
      /* ungültige URL — ignorieren */
    }
  });
}

/**
 * Ein delegierter Klick-Listener für alles.
 *
 * Reihenfolge ist bedeutsam: `CTA Click` läuft zuerst und unabhängig vom
 * Anchor-Zweig, weil `data-cta` auch auf `<button>` sitzt. WhatsApp wird vor dem
 * Outbound-Zweig geprüft, sonst zählte es nur als generischer `Outbound Click`.
 */
function initClickEvents(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    if (!target?.closest) return;

    const cta = target.closest('[data-cta]');
    if (cta) {
      track('CTA Click', { name: cta.getAttribute('data-cta') || 'unnamed' });
    }

    // Navigation getrennt von Conversion (v0.156.0). Ein Element traegt immer
    // nur eines der beiden Attribute — ctaAttrs() gibt genau eines aus, und ein
    // Guard prueft die Ausschliesslichkeit zusaetzlich im Markup.
    // `Nav Click` ist bewusst KEIN Goal (ENGAGEMENT_IGNORE), aber auswertbar:
    // Davor floss Navigation in `CTA Click` ein und machte dort rund vier
    // Fuenftel der Treffer aus.
    const nav = target.closest('[data-nav-click]');
    if (nav) {
      track('Nav Click', {
        name: nav.getAttribute('data-nav-click') || 'unnamed',
        label: nav.textContent?.trim().slice(0, 80) ?? '',
      });
    }

    const a = target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') ?? '';
    const location = sectionLoc(a);

    if (href.startsWith('tel:')) {
      track('Phone Click', { location, number: href.replace('tel:', '') });
    } else if (href.startsWith('mailto:')) {
      track('Email Click', { location, address: href.replace('mailto:', '').split('?')[0] });
    } else if (WHATSAPP_RE.test(href)) {
      const number = href.match(/wa\.me\/(\d+)/)?.[1] ?? '';
      track('WhatsApp Click', number ? { location, number } : { location });
    } else if (href.endsWith('.pdf') || href.includes('.pdf?')) {
      track('File Download', { filename: href.split('/').pop()?.split('?')[0] ?? href });
    } else if (href.startsWith('http') && !href.includes(window.location.hostname)) {
      try {
        track('Outbound Click', { url: new URL(href).origin });
      } catch {
        /* ungültige URL — kein Event */
      }
    }
  });
}

/**
 * Auffangnetz für Formulare ohne eigenes Tracking.
 *
 * Trägt ein `<form>` den Marker `data-cw-form-tracked`, zählt die Komponente
 * selbst (mit `status` success/error) — dann hier nicht mitzählen, sonst
 * erscheint jede Absendung doppelt. `status: 'submitted'` grenzt den
 * Absendeversuch vom Ergebnis ab.
 *
 * Capture-Phase am `document`: erfasst auch Formulare, die erst nach dem Laden
 * entstehen. Deshalb muss der Marker statisch im Markup stehen — ein per JS
 * nachgerüstetes Attribut käme zu spät.
 */
function initFormEvents(): void {
  document.addEventListener(
    'submit',
    (e) => {
      const f = e.target as HTMLFormElement | null;
      if (!f || f.tagName !== 'FORM') return;
      if (f.hasAttribute('data-cw-form-tracked')) return;
      track('Form Submit', {
        form: f.id || f.getAttribute('name') || f.getAttribute('action') || 'form',
        status: 'submitted',
      });
    },
    true
  );
}

/** Scroll-Tiefe, einmal je Seitenaufruf bei 25/50/75/100 %. */
function initScrollDepth(): void {
  const fired = new Set<number>();
  let ticking = false;

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      if (docH <= 0) {
        ticking = false;
        return;
      }
      const pct = Math.round((window.scrollY / docH) * 100);
      for (const m of SCROLL_MILESTONES) {
        if (pct >= m && !fired.has(m)) {
          fired.add(m);
          track('Scroll Depth', { depth: m });
        }
      }
      ticking = false;
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
}

/** Verweildauer bei 30 s / 2 min / 5 min. */
function initTimeOnPage(): void {
  TIME_MILESTONES.forEach(([ms, label]) => {
    setTimeout(() => track('Time on Page', { duration: label }), ms);
  });
}

/**
 * Registriert alle automatischen Events. Idempotent: ein zweiter Aufruf auf
 * derselben Seite tut nichts.
 *
 * Die Idempotenz ist kein Luxus — sie deckt den Fall ab, dass ein Kundenrepo
 * `<PlausibleEvents />` einbindet UND das Layout im inline-Modus läuft. Vor der
 * Zusammenführung war genau das ein Doppelfeuer-Risiko, das nur ein
 * Runtime-Gate über ein html-Attribut verhinderte.
 */
export function initAutoEvents(opts: AutoEventOptions = {}): void {
  const w = window as unknown as { __cwAutoEvents?: boolean };
  if (w.__cwAutoEvents) return;
  w.__cwAutoEvents = true;

  initAttribution(opts.paidVisit === true);
  initBrandBacklink();
  initClickEvents();
  initFormEvents();
  initScrollDepth();
  initTimeOnPage();
}
