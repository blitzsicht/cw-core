// Foto-Vorbereitung für das offer-Split-Layout (Person rechts).
// featherLeft() skaliert das Foto auf Panel-Höhe, platziert die Person
// rechtsbündig und blendet den LINKEN Rand per Alpha-Verlauf ins Transparente —
// so „taucht" die Person aus der Hintergrund-Fläche auf, ohne Farb-Wash übers
// Gesicht (das rechts voll opak bleibt). Ergebnis: RGBA-PNG (width×height).
//
// Braucht `sharp` im Consumer (wie renderOg).

async function getSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    throw new Error("[cw-core/og:photo] 'sharp' fehlt — im Consumer installieren: pnpm add -D sharp");
  }
}

/**
 * @param {Buffer|string} src   Foto-Buffer oder Pfad (Portrait bevorzugt)
 * @param {object} [o]
 * @param {number} [o.width=560]   Panel-Breite
 * @param {number} [o.height=630]  Panel-Höhe
 * @param {number} [o.fadeStart=0.30] Alpha-Verlauf: bis hier transparent (Anteil der Breite)
 * @param {number} [o.opaqueFrom=0.52] ab hier voll opak → Gesicht sollte rechts davon liegen
 * @param {'top'|'centre'|'attention'} [o.position='top'] vertikaler Crop bei Cover
 * @param {number} [o.fill=1] Motiv-Höhe als Anteil der Panel-Höhe (<1 = Kopffreiheit)
 * @param {'bottom'|'centre'|'top'} [o.valign] vertikale Ausrichtung im Panel (Default: bottom wenn fill<1, sonst top)
 * @returns {Promise<Buffer>} RGBA-PNG (width×height)
 */
export async function featherLeft(src, o = {}) {
  const sharp = await getSharp();
  const width = o.width ?? 560;
  const height = o.height ?? 630;
  const fadeStart = o.fadeStart ?? 0.30;
  const opaqueFrom = o.opaqueFrom ?? 0.52;
  const fill = o.fill ?? 1;
  const subjectH = Math.round(height * fill);
  const valign = o.valign ?? (fill < 1 ? 'bottom' : 'top');

  // Motiv auf Ziel-Höhe skalieren, natürliche Breite behalten.
  const scaled = await sharp(src).resize({ height: subjectH }).png().toBuffer();
  const { width: sw } = await sharp(scaled).metadata();
  const imgW = Math.min(sw, width);
  const img = sw > width
    ? await sharp(src).resize(width, subjectH, { fit: 'cover', position: o.position ?? 'top' }).png().toBuffer()
    : scaled;

  const top = valign === 'bottom' ? height - subjectH : valign === 'centre' ? Math.round((height - subjectH) / 2) : 0;
  const padRight = o.padRight ?? 0; // kleiner Rechts-Abstand → Motiv nicht am Rand angeschnitten
  const base = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: img, left: Math.max(0, width - imgW - padRight), top }]).png().toBuffer();

  // Horizontaler Alpha-Verlauf: links transparent → rechts opak.
  const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="${fadeStart}" stop-color="#fff" stop-opacity="0"/>
      <stop offset="${opaqueFrom}" stop-color="#fff" stop-opacity="1"/>
    </linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/></svg>`;

  return sharp(base).composite([{ input: Buffer.from(mask), blend: 'dest-in' }]).png().toBuffer();
}
