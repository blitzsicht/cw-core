/**
 * Formulare im Browser wirklich absenden (blitzsicht-ops#900).
 *
 * Die Unit-Tests prüfen den Handler, die Render-Tests das Markup. Hier läuft die
 * Kette dazwischen: Klick → Client-Skript in ContactForm.astro (Prüfung, JSON-POST)
 * → echter createContactHandler → Erfolgs- oder Fehlerblock. Jeder Positivfall zählt
 * genau einen abgefangenen Request und genau einen Resend-Aufruf. „Kein Fehler“
 * allein wäre auch grün, wenn das Formular gar nichts abschickt.
 */
import { test, expect } from '@playwright/test';
import { ENDPOINTS, verbinde } from './handler-route';

test('Kontakt: Name, E-Mail, Nachricht → Erfolg, eine Mail', async ({ page }) => {
  const auf = await verbinde(page, ENDPOINTS.freigeschaltet);
  await page.goto('/kontakt/');
  await page.fill('#cf-name', 'Erika Muster');
  await page.fill('#cf-email', 'erika@example.org');
  await page.fill('#cf-message', 'E2E-Nachricht Kontakt 4711');
  await page.click('button[type="submit"]');

  await expect(page.locator('.form-success')).toBeVisible();
  await expect(page.locator('.form-error')).toBeHidden();
  expect(auf.requests).toHaveLength(1);
  expect(auf.requests[0].status).toBe(200);
  expect(auf.resend).toHaveLength(1);
  expect(JSON.stringify(auf.resend[0])).toContain('E2E-Nachricht Kontakt 4711');
});

test('Rückruf mit Opt-in: ohne E-Mail, mit Telefon und Zeitfenster → Erfolg', async ({ page }) => {
  const auf = await verbinde(page, ENDPOINTS.freigeschaltet);
  await page.goto('/rueckruf/');
  await page.fill('#cf-name', 'Max Rückruf');
  await page.fill('#cf-telefon', '0941 123456');
  await page.selectOption('#cf-zeitfenster', 'nachmittags');
  await page.click('button[type="submit"]');

  await expect(page.locator('.form-success')).toBeVisible();
  expect(auf.requests).toHaveLength(1);
  expect(auf.requests[0].body.formType).toBe('rueckruf');
  expect(auf.requests[0].status).toBe(200);
  expect(auf.resend).toHaveLength(1);
  const mail = JSON.stringify(auf.resend[0]);
  expect(mail).toContain('0941 123456');
  expect(mail).toContain('nachmittags');
});

test('Empfehlung mit Opt-in: nur Telefon → Erfolg „Danke für Ihre Empfehlung!“', async ({ page }) => {
  const auf = await verbinde(page, ENDPOINTS.freigeschaltet);
  await page.goto('/empfehlung/');
  await page.fill('#cf-name', 'Eva Empfehlung');
  await page.fill('#cf-telefon', '0941 654321');
  await page.click('form[data-form-type="empfehlung"] button[type="submit"]');

  await expect(page.getByRole('heading', { name: 'Danke für Ihre Empfehlung!' })).toBeVisible();
  expect(auf.requests).toHaveLength(1);
  expect(auf.requests[0].body.formType).toBe('empfehlung');
  expect(auf.requests[0].status).toBe(200);
  expect(auf.resend).toHaveLength(1);
  expect(JSON.stringify(auf.resend[0])).toContain('0941 654321');
});

test('Rückruf ohne Opt-in: 400, Fehlerblock mit Mail-Fallback, Lead als Alarm', async ({ page }) => {
  const auf = await verbinde(page, ENDPOINTS.ohneOptIn);
  await page.goto('/rueckruf/');
  await page.fill('#cf-name', 'Max Vergessen');
  await page.fill('#cf-telefon', '0941 999999');
  await page.click('button[type="submit"]');

  const fehler = page.locator('.form-error');
  await expect(fehler).toBeVisible();
  await expect(fehler).toHaveAttribute('role', 'alert');
  await expect(fehler.locator('a[href="mailto:info@example.org"]')).toBeVisible();
  // Die Meldung des Handlers erreicht den Besucher (ops#915), nicht nur „Etwas ist schiefgelaufen“.
  await expect(fehler.locator('.form-error-detail')).toHaveText('Rückruf-Formular ist hier nicht freigeschaltet.');
  await expect(page.locator('.form-success')).toBeHidden();
  expect(auf.requests).toHaveLength(1);
  expect(auf.requests[0].status).toBe(400);
  // Nicht still verloren: die Nummer steht im Telegram-Alarm.
  expect(auf.telegram.length).toBeGreaterThan(0);
  expect(JSON.stringify(auf.telegram)).toContain('0941 999999');
});

test('Empfehlung ohne E-Mail und Telefon: Browser schickt nichts ab', async ({ page }) => {
  const auf = await verbinde(page, ENDPOINTS.freigeschaltet);
  await page.goto('/empfehlung/');
  await page.fill('#cf-name', 'Eva Ohne');
  await page.click('form[data-form-type="empfehlung"] button[type="submit"]');

  // Die Prüfung setzt eine Fehlermeldung am E-Mail-Feld (setCustomValidity).
  await expect.poll(() => page.$eval('#cf-email', (el) => (el as HTMLInputElement).validationMessage)).not.toBe('');
  await expect(page.locator('form[data-form-type="empfehlung"]')).toBeVisible();
  expect(auf.requests).toHaveLength(0);
});

test('Zu viele Anfragen: 429, Meldung sichtbar, Eingaben bleiben', async ({ page }) => {
  const auf = await verbinde(page, ENDPOINTS.gedrosselt);
  await page.goto('/kontakt/');
  await page.fill('#cf-name', 'Rita Rate');
  await page.fill('#cf-email', 'rita@example.org');
  await page.fill('#cf-message', 'E2E-Nachricht Drossel');
  await page.click('button[type="submit"]');

  const fehler = page.locator('.form-error');
  await expect(fehler).toBeVisible();
  await expect(fehler.locator('.form-error-detail')).toHaveText('Zu viele Anfragen. Bitte später erneut versuchen.');
  await expect(page.locator('#cf-message')).toHaveValue('E2E-Nachricht Drossel');
  await expect(page.locator('button[type="submit"]')).toBeEnabled();
  expect(auf.requests).toHaveLength(1);
  expect(auf.requests[0].status).toBe(429);
  expect(auf.resend).toHaveLength(0);
});

test('Versand scheitert: 500, nur allgemeiner Text mit Mail-Ausweg, keine Servermeldung', async ({ page }) => {
  const auf = await verbinde(page, ENDPOINTS.freigeschaltet, { resendFaellt: true });
  await page.goto('/kontakt/');
  await page.fill('#cf-name', 'Sven Server');
  await page.fill('#cf-email', 'sven@example.org');
  await page.fill('#cf-message', 'E2E-Nachricht Ausfall');
  await page.click('button[type="submit"]');

  const fehler = page.locator('.form-error');
  await expect(fehler).toBeVisible();
  await expect(fehler.locator('.form-error-detail')).toBeHidden();
  await expect(fehler).toContainText('Etwas ist schiefgelaufen');
  await expect(fehler.locator('a[href="mailto:info@example.org"]')).toBeVisible();
  await expect(page.locator('#cf-message')).toHaveValue('E2E-Nachricht Ausfall');
  expect(auf.requests).toHaveLength(1);
  expect(auf.requests[0].status).toBe(500);
  // Nicht verloren: Lead mit Zustellfehler im Telegram-Alarm.
  // Telegram (MarkdownV2) maskiert '-', deshalb Name und Kennzeichnung statt Nachrichtentext.
  const alarm = JSON.stringify(auf.telegram);
  expect(alarm).toContain('ZUSTELLUNG FEHLGESCHLAGEN');
  expect(alarm).toContain('Sven Server');
});
