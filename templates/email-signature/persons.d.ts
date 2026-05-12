/**
 * Schema für die `persons`-Liste in customer-X/src/data/site-data.ts.
 * Eine Person = eine generierte HTML-E-Mail-Signatur.
 *
 * Verwendung in customer-X/src/data/site-data.ts:
 *   import type { EmailSigPerson } from '@cw/core/templates/email-signature/persons';
 *   ...
 *   persons: [
 *     { slug: 'markus-steller', name: 'Markus Steller', position: 'Geschäftsführer',
 *       email: 'markus.steller@digital-direkt.com', phone: '+49 9401 53959-20',
 *       layout: 'a', salutation: 'Hallo Markus' },
 *   ] as const satisfies readonly EmailSigPerson[],
 *
 * Das JSON-Schema (persons.schema.json) hält die kanonische Definition für
 * Pipeline-Tools (read-customer-data.py liest gegen diese Struktur).
 */

export type EmailSigPerson = {
  /** URL-safe Identifier, wird zum Dateinamen (lowercase + Bindestriche). */
  slug: string;
  /** Anzeigename in der Signatur. */
  name: string;
  /** Position/Rolle in der Signatur. */
  position?: string;
  /** Person-E-Mail (überschreibt legal.email aus site-data.ts). */
  email: string;
  /** Person-Telefon (überschreibt legal.phone aus site-data.ts). */
  phone?: string;
  /** Layout-Override. 'auto' = Aspect-Ratio-Detection. */
  layout?: 'a' | 'b' | 'auto';
  /** Anrede in der Begleitmail (z.B. "Servus Markus"). */
  salutation?: string;
};
