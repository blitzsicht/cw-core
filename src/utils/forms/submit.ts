/**
 * @cw/core – form submission helper
 *
 * Isomorphic helper that submits a `<form>` element to one of:
 *   • Web3Forms (default — multipart/form-data POST)
 *   • A custom endpoint (JSON POST — suitable for Vercel Functions
 *     that bridge to Tally.so, Formspree, Resend, a CRM, etc.)
 *
 * The inline `<script>` in `ContactForm.astro` uses the same behaviour
 * directly; this module is provided for customer projects that want to
 * wire their own forms to the same submission protocol without copying
 * the script.
 *
 * @example
 *   import { submitForm } from '@cw/core/utils/forms/submit';
 *
 *   form.addEventListener('submit', async (e) => {
 *     e.preventDefault();
 *     const result = await submitForm(form, { actionUrl: '/api/contact' });
 *     if (result.ok) {
 *       showSuccess();
 *     } else {
 *       showError(result.error);
 *     }
 *   });
 */

export interface SubmitOptions {
  /**
   * Target URL. When omitted, Web3Forms (`https://api.web3forms.com/submit`)
   * is used. When pointing at a non-web3forms host, the payload is sent as
   * JSON instead of multipart/form-data.
   */
  actionUrl?: string;
  /**
   * Force JSON encoding regardless of URL. Useful for Vercel Functions that
   * don't parse multipart natively.
   */
  forceJson?: boolean;
  /** Request timeout in ms. Defaults to 15000 (15s). */
  timeoutMs?: number;
}

export interface SubmitResult {
  ok: boolean;
  /** Raw JSON response from the backend, if any. */
  data?: unknown;
  /** Error message on failure. */
  error?: string;
}

const WEB3FORMS_URL = 'https://api.web3forms.com/submit';

/**
 * Submit an HTMLFormElement using the shared @cw/core protocol.
 *
 * Rules:
 *  - Web3Forms host → POST as multipart/form-data (FormData)
 *  - Any other host (or `forceJson: true`) → POST as application/json,
 *    converting FormData string fields into a flat object.
 *
 * The backend is expected to return JSON of the shape
 * `{ success?: boolean; ok?: boolean; message?: string }`.
 */
export async function submitForm(
  form: HTMLFormElement,
  options: SubmitOptions = {},
): Promise<SubmitResult> {
  const { actionUrl, forceJson = false, timeoutMs = 15_000 } = options;
  const submitUrl = actionUrl ?? WEB3FORMS_URL;
  const isWeb3Forms = submitUrl.includes('web3forms.com');
  const asJson = forceJson || !isWeb3Forms;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const data = new FormData(form);
    let res: Response;

    if (asJson) {
      const obj: Record<string, string> = {};
      data.forEach((v, k) => {
        if (typeof v === 'string') obj[k] = v;
      });
      res = await fetch(submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obj),
        signal: controller.signal,
      });
    } else {
      res = await fetch(submitUrl, {
        method: 'POST',
        body: data,
        signal: controller.signal,
      });
    }

    const json = (await res
      .json()
      .catch(() => ({}))) as { success?: boolean; ok?: boolean; message?: string };

    if (json.success || json.ok) {
      return { ok: true, data: json };
    }
    return { ok: false, data: json, error: json.message ?? `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
