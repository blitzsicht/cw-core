type PlausibleProps = Record<string, string | number | boolean>;

type PlausibleFn = (event: string, options?: { props?: PlausibleProps }) => void;

export function track(event: string, props?: PlausibleProps): void {
  if (typeof window === 'undefined') return;
  const plausible = (window as Window & { plausible?: PlausibleFn }).plausible;
  plausible?.(event, props ? { props } : undefined);
}
