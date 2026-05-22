// @ts-check
/**
 * @cw/core — buildBriefingEmail
 *
 * Rendert zwei Mail-Bodies (HTML + Plain-Text) fuer einen Briefing-Submit:
 *   1. `internal`     — strukturiert nach Sektionen, Tabellen-Layout, Progress-Header.
 *   2. `confirmation` — kurze Danke-Mail an den Kunden ("innerhalb 24 h").
 *
 * Pattern uebernommen aus customer-mika-elektrotechnik/api/onboarding.ts (Lines 108-181).
 *
 * Brand-Akzent ist parametrisiert — Default = Blitzsicht (Nachtblau / Orange).
 * Customer-spezifische Akzente (z.B. Mika-Tuerkis #004650 / Mint #19e187)
 * koennen via `brand`-Param ueberschrieben werden.
 *
 * Plain-Text wird parallel mitgerendert (Resend liefert beide).
 */

const DEFAULT_BRAND_PRIMARY = '#1D1E3B'; // Blitzsicht Nachtblau
const DEFAULT_BRAND_ACCENT = '#EF7612';  // Blitzsicht Orange

/**
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {string} s
 * @returns {string}
 */
function nl2br(s) {
  return escapeHtml(s).replace(/\r?\n/g, '<br />');
}

/**
 * @typedef {Object} BriefingFieldLite
 * @property {string} id
 * @property {string} label
 * @property {boolean} [required]
 */

/**
 * @typedef {Object} BriefingSectionLite
 * @property {string} id
 * @property {string} emoji
 * @property {string} title
 * @property {string} [subtitle]
 * @property {BriefingFieldLite[]} fields
 */

/**
 * @typedef {Object} BriefingBrandColors
 * @property {string} [primary]   – Header-/Heading-Farbe (Default: Blitzsicht-Nachtblau).
 * @property {string} [accent]    – Akzentfarbe (Section-Underline) (Default: Blitzsicht-Orange).
 */

/**
 * @typedef {Object} BuildBriefingEmailInput
 * @property {string} customerName              – Anzeigename des Kunden (z.B. "Mika Elektrotechnik").
 * @property {Record<string, string>} payload   – Form-Submission-Payload (fieldId → value).
 * @property {BriefingSectionLite[]} sections   – Section-Schema (briefingSections).
 * @property {string} submissionUrl             – URL der Customer-Onboarding-Page (z.B. https://mikaelektro.com/onboarding).
 * @property {string[]} requiredFieldIds        – Vorbereitet — fuer den Progress-Header.
 * @property {BriefingBrandColors} [brand]      – Optionale Brand-Color-Overrides.
 * @property {string} [photoUploadDestination]  – Wenn gesetzt: Confirmation-Mail enthaelt Foto-Upload-Anleitung. Beispiel: 'servus@blitzsicht.com'.
 * @property {string} [photoUploadServiceLabel] – Service-Name fuer Foto-Upload-Anleitung. Default: 'WeTransfer'.
 * @property {string} [photoUploadServiceUrl]   – Upload-Service-URL. Default: 'https://wetransfer.com/'.
 */

/**
 * @typedef {Object} BuildBriefingEmailOutput
 * @property {{ html: string, text: string }} internal
 * @property {{ html: string, text: string }} confirmation
 * @property {number} filledRequired
 * @property {number} totalRequired
 */

/**
 * @param {BuildBriefingEmailInput} input
 * @returns {BuildBriefingEmailOutput}
 */
export function buildBriefingEmail(input) {
  const {
    customerName,
    payload,
    sections,
    submissionUrl,
    requiredFieldIds,
    brand = {},
    photoUploadDestination,
    photoUploadServiceLabel = 'WeTransfer',
    photoUploadServiceUrl = 'https://wetransfer.com/',
  } = input;

  const brandPrimary = brand.primary || DEFAULT_BRAND_PRIMARY;
  const brandAccent = brand.accent || DEFAULT_BRAND_ACCENT;

  // ----- Counter fuer Pflichtfeld-Progress -----
  const totalRequired = requiredFieldIds.length;
  const filledRequired = requiredFieldIds.filter((id) => {
    const v = payload[id];
    return typeof v === 'string' && v.trim().length > 0;
  }).length;

  // ----- Section-Rendering (nur ausgefuellte Felder) -----
  /** @type {string[]} */
  const sectionsHtml = [];
  /** @type {string[]} */
  const sectionsText = [];

  for (const section of sections) {
    const fieldsFilled = section.fields.filter((f) => {
      const v = payload[f.id];
      return typeof v === 'string' && v.trim().length > 0;
    });
    if (fieldsFilled.length === 0) continue;

    sectionsHtml.push(`
      <h2 style="margin:1.5rem 0 0.5rem;color:${brandPrimary};font-size:1.05rem;border-bottom:2px solid ${brandAccent};padding-bottom:0.25rem;">
        ${escapeHtml(section.emoji)} ${escapeHtml(section.title)}
      </h2>
      <table cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:0.9rem;">
        ${fieldsFilled
          .map((f) => {
            const v = (payload[f.id] || '').trim();
            return `
              <tr>
                <td style="vertical-align:top;width:38%;color:#2c2d3d;font-weight:600;padding:6px 8px;background:#f7faf9;border-bottom:1px solid #e5ebe9;">
                  ${escapeHtml(f.label)}
                </td>
                <td style="vertical-align:top;padding:6px 8px;border-bottom:1px solid #e5ebe9;color:#1a1a1a;">
                  ${nl2br(v)}
                </td>
              </tr>`;
          })
          .join('')}
      </table>
    `);

    sectionsText.push(
      `\n## ${section.emoji} ${section.title}\n` +
        fieldsFilled
          .map((f) => `- ${f.label}: ${(payload[f.id] || '').trim()}`)
          .join('\n'),
    );
  }

  // ----- Internal Mail (an Blitzsicht) -----
  const safeCustomer = escapeHtml(customerName);
  const safeUrl = escapeHtml(submissionUrl);

  const internalHtml = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><title>Onboarding-Briefing</title></head>
<body style="font-family:system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;background:#ffffff;color:#1a1a1a;line-height:1.5;padding:1.5rem;">
  <div style="max-width:680px;margin:0 auto;">
    <h1 style="color:${brandPrimary};font-size:1.3rem;margin:0 0 0.25rem;">Onboarding-Briefing — ${safeCustomer}</h1>
    <p style="color:#6b7280;font-size:0.875rem;margin:0 0 1.5rem;">
      Eingegangen über <strong>${safeUrl}</strong> ·
      Pflichtfelder: <strong>${filledRequired}/${totalRequired}</strong> ausgefüllt
    </p>
    ${sectionsHtml.join('\n')}
    <p style="margin-top:2rem;padding-top:1rem;border-top:1px solid #e5ebe9;color:#6b7280;font-size:0.8125rem;">
      Diese E-Mail wurde automatisch vom Briefing-Handler erzeugt. Antworten gehen an den Kunden, falls eine E-Mail-Adresse hinterlegt ist.
    </p>
  </div>
</body>
</html>`;

  const internalText =
    `Onboarding-Briefing — ${customerName}\n` +
    `Eingegangen über ${submissionUrl}\n` +
    `Pflichtfelder: ${filledRequired}/${totalRequired}\n` +
    sectionsText.join('\n') +
    `\n\n---\nAutomatisch erzeugt vom Briefing-Handler.\n`;

  // ----- Confirmation Mail (an Kunden) -----
  // Vorname aus dem "geschaeftsfuehrung"-Field extrahieren (falls vorhanden).
  // Falls nicht: generische Begruessung.
  const ceoField = (payload.geschaeftsfuehrung || payload.ansprechpartner || '').trim();
  const customerFirstName = ceoField ? ceoField.split(',')[0]?.split(/\s+/)[0]?.trim() : '';
  const greeting = customerFirstName ? `, ${escapeHtml(customerFirstName)}` : '';
  const greetingText = customerFirstName ? `, ${customerFirstName}` : '';

  // Photo-Upload-Block (konditional — nur wenn photoUploadDestination konfiguriert ist).
  // Pattern: Customer schickt Briefing-Beschreibungen via Form, Bilder dann via WeTransfer
  // (oder einem anderen frei wählbaren File-Transfer-Service) an die Empfangs-Adresse.
  const safeUploadDest = photoUploadDestination ? escapeHtml(photoUploadDestination) : '';
  const safeUploadService = escapeHtml(photoUploadServiceLabel);
  const safeUploadUrl = escapeHtml(photoUploadServiceUrl);
  const photoUploadBlockHtml = photoUploadDestination
    ? `
    <h2 style="color:${brandPrimary};font-size:1.0625rem;margin:1.5rem 0 0.75rem;">Bilder &amp; Fotos nachreichen</h2>
    <p>Im Briefing-Formular haben Sie nur kurz beschrieben, welche Bilder verfügbar sind. Die Bilder selbst schicken Sie uns ganz einfach per File-Transfer-Link:</p>
    <ol style="padding-left:1.25rem;margin:0 0 1rem;">
      <li>Öffnen Sie <a href="${safeUploadUrl}" style="color:${brandAccent};">${safeUploadService}</a> im Browser oder auf dem Smartphone</li>
      <li>Bilder per Drag-and-Drop oder „Datei hinzufügen" auswählen</li>
      <li>Empfänger-Adresse: <strong>${safeUploadDest}</strong></li>
      <li>Im Nachrichten-Feld bitte Ihren Firmennamen als Referenz</li>
      <li>Absenden — kostenlos, kein Account nötig</li>
    </ol>
    <p style="color:#6b7280;font-size:0.875rem;">Smartphone-Tipp: Bilder aus der Foto-/WhatsApp-Galerie funktionieren genauso. Wenn ${safeUploadService} nicht passt, gehen auch SwissTransfer, Smash oder Filemail — Empfänger bleibt ${safeUploadDest}.</p>`
    : '';

  const confirmationHtml = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;background:#ffffff;color:#1a1a1a;line-height:1.6;padding:1.5rem;">
  <div style="max-width:560px;margin:0 auto;">
    <h1 style="color:${brandPrimary};font-size:1.25rem;margin:0 0 1rem;">Vielen Dank${greeting}!</h1>
    <p>Wir haben Ihr ausgefülltes Onboarding-Briefing für die neue ${safeCustomer}-Website erhalten.</p>
    <p>
      Wir schauen uns alles in Ruhe an und melden uns <strong>innerhalb von 24 Stunden</strong> bei Ihnen
      mit dem nächsten Schritt — meistens mit ein paar Rückfragen und einem aktualisierten Designvorschau-Link.
    </p>${photoUploadBlockHtml}
    <p>
      Bei Fragen erreichen Sie uns jederzeit unter
      <a href="mailto:servus@blitzsicht.com" style="color:${brandAccent};">servus@blitzsicht.com</a>.
    </p>
    <p style="margin-top:2rem;color:#6b7280;font-size:0.875rem;">
      Herzliche Grüße<br />
      Ihr Blitzsicht-Team
    </p>
  </div>
</body>
</html>`;

  const photoUploadBlockText = photoUploadDestination
    ? `\nBilder & Fotos nachreichen:\n` +
      `Im Briefing haben Sie nur kurz beschrieben, welche Bilder verfügbar sind. Die Bilder selbst schicken Sie uns per File-Transfer:\n` +
      `  1. ${photoUploadServiceLabel} öffnen: ${photoUploadServiceUrl}\n` +
      `  2. Bilder auswählen\n` +
      `  3. Empfänger: ${photoUploadDestination}\n` +
      `  4. Im Nachrichten-Feld: Ihr Firmenname\n` +
      `  5. Absenden — kostenlos, kein Account\n` +
      `Smartphone-Tipp: Auch SwissTransfer/Smash/Filemail funktionieren — Empfänger bleibt ${photoUploadDestination}.\n\n`
    : '';

  const confirmationText =
    `Vielen Dank${greetingText}!\n\n` +
    `Wir haben Ihr ausgefülltes Onboarding-Briefing für die neue ${customerName}-Website erhalten.\n\n` +
    `Wir schauen uns alles in Ruhe an und melden uns innerhalb von 24 Stunden bei Ihnen.\n` +
    photoUploadBlockText +
    `Bei Fragen: servus@blitzsicht.com\n\n` +
    `Herzliche Grüße\n` +
    `Ihr Blitzsicht-Team\n`;

  return {
    internal: { html: internalHtml, text: internalText },
    confirmation: { html: confirmationHtml, text: confirmationText },
    filledRequired,
    totalRequired,
  };
}
