export interface BuildCspOptions {
  /** Plausible Analytics (plausible.io). Default true. */
  plausible?: boolean;
  /** Cloudflare Turnstile (challenges.cloudflare.com). Default true. */
  turnstile?: boolean;
  /** Cal.com Booking (app.cal.eu). Default false. */
  cal?: boolean;
  /** Tally Forms (tally.so). Default false. */
  tally?: boolean;
}

export function normOrigin(o: string): string;
export function buildCsp(siteOrigin: string, opts?: BuildCspOptions): string;
export function fixCsp(existing: string, siteOrigin: string): string;
