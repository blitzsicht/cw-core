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
 * @returns {Promise<Buffer>} RGBA-PNG (width×height)
 */
export async function featherLeft(src, o = {}) {
  const sharp = await getSharp();
  const width = o.width ?? 560;
  const height = o.height ?? 630;
  const fadeStart = o.fadeStart ?? 0.30;
  const opaqueFrom = o.opaqueFrom ?? 0.52;

  // Auf Panel-Höhe skalieren, natürliche Breite behalten.
  const scaled = await sharp(src).resize({ height }).png().toBuffer();
  const { width: wn } = await sharp(scaled).metadata();

  let base;
  if (wn >= width) {
    // Breiter als Panel → Cover-Crop (Kopf oben halten).
    base = await sharp(src).resize(width, height, { fit: 'cover', position: o.position ?? 'top' }).ensureAlpha().png().toBuffer();
  } else {
    // Schmaler → auf transparente Fläche rechtsbündig setzen (links echte Blende).
    base = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: scaled, left: width - wn, top: 0 }]).png().toBuffer();
  }

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
