/**
 * @cw/core – scripts/motion-runtime
 *
 * Das gesamte Laufzeitverhalten des Motion-Layers in EINEM Modul. Jede
 * Motion-Komponente bindet es über einen zeichengleichen `<script>`-Block ein:
 *
 *   <script>
 *     import { initMotion } from '../../scripts/motion-runtime';
 *     initMotion();
 *   </script>
 *
 * Zeichengleich ist Bedingung, nicht Kosmetik: Astro fasst identische
 * `<script>`-Blöcke zu einem Bundle zusammen. Weicht einer ab, liefert die
 * Seite dasselbe Modul mehrfach aus.
 *
 * ## Warum es dieses Modul gibt (blitzsicht-ops#650)
 *
 * StaggerGroup, CountUp, TextReveal und ParallaxImage trugen bis 11.08.2026 je
 * ein eigenes `is:inline`-Script im HTML, das sich per `document.getElementById`
 * selbst wiederfand. Die dafür nötige ID kam aus `Math.random()` — zwei Builds
 * derselben Quelle erzeugten dadurch unterschiedliche Bytes, jeder Deploy
 * entwertete den Cache jeder Seite mit Motion. Nebenbei lag der komplette
 * IIFE-Rumpf pro Instanz im HTML (blitzsicht: ~300 Kopien).
 *
 * Attributgesteuert braucht niemand eine ID: die Konfiguration stand ohnehin
 * schon als `data-*` am Element.
 *
 * ## Zeitpunkt
 *
 * Dieses Modul läuft nach dem Parsen, nicht während. Alles hier drin darf
 * deshalb das Layout NICHT verändern — sonst entsteht ein sichtbarer Sprung.
 * Die zwei Stellen, die das früher taten, sind bewusst nicht hierher gewandert:
 * die Wort-Zerlegung von TextReveal passiert jetzt im Build
 * (`utils/text/split-text-units.js`), der Vorzustand der Stagger-Kinder kommt
 * aus `tokens-base.css`. Wer hier eine DOM-Mutation ergänzt, die Höhe oder
 * Umbruch beeinflusst, holt sich CLS zurück.
 */

/** Marker, damit ein zweiter Lauf (View Transitions) nichts doppelt aufsetzt. */
const READY = 'data-motion-ready';

/**
 * Elemente, die beim Viewport-Eintritt `.is-visible` bekommen.
 * `[data-motion-stagger]` und `[data-motion-text-reveal]` stehen hier mit
 * drin: die Staffelung der Kinder bzw. der Wort-Einheiten hängt allein an
 * dieser Klasse am Wurzelelement.
 */
const REVEAL_SELECTOR = [
  '[data-motion-reveal]',
  '[data-motion-stagger]',
  '[data-motion-text-reveal]',
]
  .map((s) => `${s}:not(.is-visible):not([${READY}])`)
  .join(', ');

/**
 * Blendet Elemente ein, sobald sie in den Viewport kommen.
 *
 * Ohne `IntersectionObserver` werden sie sofort sichtbar — die Fehlerrichtung
 * muss „sichtbar" sein: der Vorzustand steht in CSS auf `opacity: 0` und nur
 * diese Funktion nimmt ihn zurück.
 */
function observeReveals(): void {
  const els = document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR);
  if (!els.length) return;

  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
  );

  els.forEach((el) => {
    el.setAttribute(READY, '');
    io.observe(el);
  });
}

/**
 * Zählt eine Zahl hoch, sobald sie in den Viewport kommt.
 * Konfiguration kommt vollständig aus den `data-*`-Attributen am Element.
 */
function initCountUps(): void {
  document
    .querySelectorAll<HTMLElement>(`[data-motion-countup]:not([${READY}])`)
    .forEach((el) => {
      const numEl = el.querySelector<HTMLElement>('[data-motion-countup-num]');
      if (!numEl) return;
      el.setAttribute(READY, '');

      const value = parseFloat(el.dataset.value || '0');
      const from = parseFloat(el.dataset.from || '0');
      const duration = parseFloat(el.dataset.duration || '1.5') * 1000;
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      const separator = el.dataset.separator || '.';

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const format = (n: number) => {
        const fixed = n.toFixed(decimals);
        if (decimals > 0) {
          const [i, d] = fixed.split('.');
          return `${i!.replace(/\B(?=(\d{3})+(?!\d))/g, separator)},${d}`;
        }
        return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
      };

      /* Der Browser hält requestAnimationFrame an, sobald der Tab in den
         Hintergrund geht. Ohne Sicherung bleibt der Zähler dann auf einem
         Zwischenwert stehen und behauptet eine Zahl, die nie gemessen wurde
         (im Browser belegt: „91" statt „95", blitzsicht StatsBar 06.08.2026).
         Deshalb: beim Verstecken sofort auf den Endwert. */
      const settle = () => {
        numEl.textContent = format(value);
      };
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) settle();
      });

      const play = () => {
        if (reduced || document.hidden || !('requestAnimationFrame' in window)) {
          settle();
          return;
        }
        const start = performance.now();
        const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          if (t >= 1 || document.hidden) {
            settle();
            return;
          }
          numEl.textContent = format(from + (value - from) * ease(t));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };

      if (!('IntersectionObserver' in window)) return play();
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              play();
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.4 },
      );
      io.observe(el);
    });
}

/**
 * Verschiebt den Inhalt langsamer als den Scroll.
 * `prefers-reduced-motion` schaltet den Effekt ganz ab (tokens-base.css setzt
 * zusätzlich `transform: none !important`).
 */
function initParallax(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document
    .querySelectorAll<HTMLElement>(`[data-motion-parallax]:not([${READY}])`)
    .forEach((el) => {
      const target =
        el.querySelector<HTMLElement>('img, picture > img') ||
        (el.firstElementChild as HTMLElement | null);
      if (!target) return;
      el.setAttribute(READY, '');

      const speed = parseFloat(el.dataset.motionParallax || '0.3');
      let ticking = false;
      const update = () => {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        // 0 when element is below viewport, 1 when it has fully scrolled past top.
        const progress = 1 - (rect.top + rect.height) / (vh + rect.height);
        const clamped = Math.max(0, Math.min(1, progress));
        const offset = (clamped - 0.5) * rect.height * speed;
        target.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
        ticking = false;
      };
      const onScroll = () => {
        if (!ticking) {
          requestAnimationFrame(update);
          ticking = true;
        }
      };
      update();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
    });
}

/** Ein Durchlauf über alles, was gerade im Dokument steht. */
function run(): void {
  observeReveals();
  initCountUps();
  initParallax();
}

let wired = false;

/**
 * Setzt den Motion-Layer auf. Mehrfach aufrufbar — jede Komponente ruft es,
 * ausgeliefert wird das Modul trotzdem einmal pro Seite.
 */
export function initMotion(): void {
  if (wired) {
    run();
    return;
  }
  wired = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  // Nach einem View-Transition-Wechsel steht neues Markup im Dokument.
  document.addEventListener('astro:page-load', run);
}
