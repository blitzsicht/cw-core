// @ts-check
/**
 * @cw/core — getClientIp
 *
 * Shared utility — extrahiert Client-IP aus einem Vercel/Node-Request.
 *
 * Reihenfolge der Trust-Sources:
 *   1. `x-vercel-forwarded-for`  — single value, von Vercel signiert. Trusted.
 *   2. `x-forwarded-for`         — Komma-Liste. Client-spoofbar im FIRST-Slot,
 *                                  daher nutzen wir den LAST-Eintrag (= naechster
 *                                  trusted Proxy / Edge-Node).
 *   3. `x-real-ip`               — falls einzelner Reverse-Proxy davor.
 *   4. `req.socket.remoteAddress`— letzter Fallback.
 *
 * Hintergrund: ein Angreifer kann `X-Forwarded-For: 1.2.3.4` setzen und ist damit
 * im FIRST-Slot — Vercel haengt aber die echte Client-IP als LETZTES Element an.
 * Siehe https://vercel.com/docs/edge-network/headers#x-forwarded-for
 *
 * Returns the string `'unknown'` if no header is set (z.B. lokale Direkt-Calls).
 */

/**
 * @param {{ headers: Record<string, string | string[] | undefined>, socket?: { remoteAddress?: string } }} req
 * @returns {string}
 */
export function getClientIp(req) {
  // 1) Vercel-trusted single-value header
  const vercelFwd = req.headers['x-vercel-forwarded-for'];
  if (typeof vercelFwd === 'string' && vercelFwd.trim()) {
    return vercelFwd.trim();
  }

  // 2) Standard XFF — LAST entry (NOT [0]!)
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    const last = fwd.split(',').at(-1)?.trim();
    if (last) return last;
  }

  // 3) x-real-ip (single reverse-proxy setup)
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) {
    return real.trim();
  }

  // 4) raw socket fallback
  const remote = req.socket?.remoteAddress;
  if (typeof remote === 'string' && remote) {
    return remote;
  }

  return 'unknown';
}
