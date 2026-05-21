/**
 * Extrahiert die Client-IP aus einem HTTP-Request.
 *
 * Bevorzugt `x-vercel-forwarded-for` (Vercel-signiert) > `x-forwarded-for` LAST
 * entry > `x-real-ip` > `socket.remoteAddress`. Returns `'unknown'` wenn nichts
 * verfuegbar.
 *
 * **Wichtig:** Nutzt LAST entry von `x-forwarded-for`, nicht FIRST — der erste
 * Slot ist Client-spoofbar.
 */
export function getClientIp(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string;
