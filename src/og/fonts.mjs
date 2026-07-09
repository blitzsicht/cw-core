// Lädt die vendored Brand-Fonts (statische otf/ttf) als Satori-FontOptions.
// Satori unterstützt ttf/otf/woff — NICHT variable woff2, deshalb statische
// Instanzen (OFL-lizenziert: Plus Jakarta Sans, Inter, JetBrains Mono).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fonts');
const read = (name) => readFileSync(join(FONT_DIR, name));

let cache = null;

/**
 * @returns {Array<{name:string,data:Buffer,weight:number,style:string}>}
 * Font-Familien: 'Jakarta' (Headlines), 'Inter' (Fließtext), 'Mono' (Domain/Code).
 */
export function loadFonts() {
  if (cache) return cache;
  cache = [
    { name: 'Jakarta', data: read('PlusJakartaSans-ExtraBold.otf'), weight: 800, style: 'normal' },
    { name: 'Jakarta', data: read('PlusJakartaSans-Bold.otf'), weight: 700, style: 'normal' },
    { name: 'Inter', data: read('Inter-Regular.otf'), weight: 400, style: 'normal' },
    { name: 'Inter', data: read('Inter-SemiBold.otf'), weight: 600, style: 'normal' },
    { name: 'Inter', data: read('Inter-Bold.otf'), weight: 700, style: 'normal' },
    { name: 'Mono', data: read('JetBrainsMono-Regular.ttf'), weight: 400, style: 'normal' },
  ];
  return cache;
}
