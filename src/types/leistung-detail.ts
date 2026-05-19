/**
 * LeistungDetail — discriminated union for service detail pages.
 *
 * `kind: 'full'` → page renders intro, checklist, process steps, disclaimer.
 * `kind: 'stub'` → page renders a short generic text + CTA.
 *
 * Customer data files export `LeistungDetail[]` and a filtered
 * `featuredLeistungen` subset for the homepage.
 */
export type LeistungDetail = {
  slug: string;
  icon: string;
  title: string;
  description: string;
  featured: boolean;
  kind: 'full' | 'stub';
  heroImage?: string;
  fullContent?: {
    intro: string;
    wasWirKoordinieren: readonly string[];
    ablauf: readonly { nr: string; icon: string; title: string; desc: string }[];
    abgrenzung: string;
  };
};
