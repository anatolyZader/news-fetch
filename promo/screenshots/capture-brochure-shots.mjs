#!/usr/bin/env node
/**
 * Capture brochure screenshots from a running srulik.ai instance.
 *
 * Production requires Firebase sign-in — provide credentials or a saved session:
 *
 *   PROMO_AUTH_EMAIL=you@example.com PROMO_AUTH_PASSWORD='…' \
 *     PROMO_BASE_URL=https://srulik.ai node promo/screenshots/capture-brochure-shots.mjs
 *
 * Reuse a saved browser session (after one successful login):
 *
 *   PROMO_STORAGE_STATE=promo/screenshots/.auth-state.json … node …
 *
 *   PROMO_HEADED=1 PROMO_BASE_URL=https://srulik.ai node …
 *   # opens a visible browser — sign in yourself (Google or email), session is saved
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = process.env.PROMO_BASE_URL || 'http://127.0.0.1:3000';
const STORAGE_STATE = process.env.PROMO_STORAGE_STATE || path.join(OUT, '.auth-state.json');
const AUTH_EMAIL = process.env.PROMO_AUTH_EMAIL?.trim() || '';
const AUTH_PASSWORD = process.env.PROMO_AUTH_PASSWORD ?? '';
const HEADED = process.env.PROMO_HEADED === '1';

const PLACEHOLDER_EMAILS = new Set(['your@email.com', 'you@example.com', 'name@example.com']);

const FILES = {
  home: '01-home-8components.png',
  narrative: '02-component-narrative.png',
  evidence: '03-evidence-pool.png',
  chat: '04-chat-cited.png',
  sources: '05-data-sources.png',
  field: '06-field-submission.png',
};

function chromiumExecutable() {
  const chromiumPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    path.join(process.env.HOME || '', '.cache/ms-playwright/chromium-1223/chrome-linux64/chrome');
  return fs.existsSync(chromiumPath) ? chromiumPath : undefined;
}

async function isLoginScreen(page) {
  const heading = page.getByRole('heading', { name: /^Sign in$/i });
  return heading.isVisible().catch(() => false);
}

async function signInWithEmail(page) {
  if (PLACEHOLDER_EMAILS.has(AUTH_EMAIL.toLowerCase()) || AUTH_PASSWORD === 'your-password') {
    throw new Error(
      'PROMO_AUTH_EMAIL/PROMO_AUTH_PASSWORD are still doc placeholders. ' +
        'Use your real invite-authorized Firebase account, or run PROMO_HEADED=1 to sign in manually.',
    );
  }
  if (!AUTH_EMAIL || !AUTH_PASSWORD) {
    throw new Error(
      'Production shows the Sign in screen. Set PROMO_AUTH_EMAIL and PROMO_AUTH_PASSWORD (real account), ' +
        'run PROMO_HEADED=1 to sign in in a browser window, or reuse promo/screenshots/.auth-state.json.',
    );
  }
  console.log('Signing in as', AUTH_EMAIL);
  await page.getByLabel(/^Email/i).fill(AUTH_EMAIL);
  await page.getByLabel(/^Password/i).fill(AUTH_PASSWORD);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await page.waitForTimeout(3000);
  const denied = page.getByText(/not authorized for this application/i);
  if (await denied.isVisible().catch(() => false)) {
    throw new Error('Account is not invite-authorized for this application.');
  }
  if (await isLoginScreen(page)) {
    const err = page.locator('[role="alert"]').filter({ hasText: /.+/ });
    let msg = 'Sign-in failed';
    if ((await err.count()) > 0) {
      msg = (await err.first().textContent())?.trim() || msg;
    }
    if (/invalid-credential/i.test(msg)) {
      throw new Error(
        `${msg} — check email/password, or use PROMO_HEADED=1 to sign in manually (Google works in headed mode).`,
      );
    }
    throw new Error(msg);
  }
}

async function waitForManualLogin(page, context) {
  console.log('');
  console.log('>>> Sign in in the browser window (email or Google).');
  console.log('>>> Waiting until "Daily assessment" appears (up to 5 min)…');
  console.log('');
  await page.waitForSelector('text=Daily assessment', { timeout: 300_000 });
  if (process.env.PROMO_SAVE_STORAGE_STATE !== '0') {
    await context.storageState({ path: STORAGE_STATE });
    console.log('Saved session →', STORAGE_STATE);
  }
}

async function ensureAuthenticated(page, context) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(1500);

  if (await isLoginScreen(page)) {
    if (AUTH_EMAIL && AUTH_PASSWORD) {
      await signInWithEmail(page);
    } else if (HEADED) {
      await waitForManualLogin(page, context);
    } else {
      throw new Error(
        'Sign in required. Use real PROMO_AUTH_EMAIL/PROMO_AUTH_PASSWORD, ' +
          'or PROMO_HEADED=1 to sign in manually, or reuse .auth-state.json from a prior login.',
      );
    }
    if (await isLoginScreen(page)) {
      throw new Error('Still on Sign in screen after login attempt.');
    }
    if (!HEADED && process.env.PROMO_SAVE_STORAGE_STATE !== '0') {
      await context.storageState({ path: STORAGE_STATE });
      console.log('Saved session →', STORAGE_STATE);
    }
  }
}

async function waitForReport(page) {
  await page.waitForSelector('text=Daily assessment', { timeout: 90_000 });
  const loading = page.getByText('Loading report');
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: 'hidden', timeout: 90_000 }).catch(() => {});
  }
  await page.waitForTimeout(2000);
}

async function assertNotLoginScreen(page, label) {
  if (await isLoginScreen(page)) {
    throw new Error(`Screenshot "${label}" would capture the Sign in page — auth failed.`);
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: !HEADED,
    executablePath: chromiumExecutable(),
  });

  const contextOptions = { viewport: { width: 1440, height: 900 } };
  if (fs.existsSync(STORAGE_STATE)) {
    console.log('Loading session from', STORAGE_STATE);
    contextOptions.storageState = STORAGE_STATE;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  try {
    console.log('Base URL:', BASE);
    await ensureAuthenticated(page, context);
    await waitForReport(page);

    await assertNotLoginScreen(page, FILES.home);
    await page.screenshot({ path: path.join(OUT, FILES.home) });
    console.log('Wrote', FILES.home);

    const sidebar = page.locator(
      'aside[aria-label*="Report contents"] button, aside[aria-label*="Report contents"] [role="button"]',
    );
    if ((await sidebar.count()) > 0) {
      await sidebar.first().click();
      await page.waitForTimeout(1200);
    }
    await assertNotLoginScreen(page, FILES.narrative);
    await page.screenshot({ path: path.join(OUT, FILES.narrative) });
    console.log('Wrote', FILES.narrative);

    const evidenceToggle = page.getByRole('button', { name: /evidence|raw source|source excerpts/i }).first();
    if (await evidenceToggle.isVisible().catch(() => false)) {
      await evidenceToggle.click();
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: path.join(OUT, FILES.evidence) });
    console.log('Wrote', FILES.evidence);

    const chatBtn = page.getByRole('button', { name: /^Chat$/i }).first();
    if (await chatBtn.isVisible().catch(() => false)) {
      await chatBtn.click();
      await page.waitForTimeout(1000);
      const input = page.locator('textarea').last();
      if (await input.isVisible().catch(() => false)) {
        await input.fill('What should I verify in the field today?');
        const send = page.getByRole('button', { name: /^Send$/i }).first();
        if (await send.isVisible().catch(() => false)) {
          await send.click();
          await page.waitForTimeout(12_000);
        }
      }
    }
    await page.screenshot({ path: path.join(OUT, FILES.chat) });
    console.log('Wrote', FILES.chat);

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);

    const sourcesBtn = page.getByRole('button', { name: /data source|choose data source|browse data sources/i }).first();
    if (await sourcesBtn.isVisible().catch(() => false)) {
      await sourcesBtn.click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: path.join(OUT, FILES.sources) });
    console.log('Wrote', FILES.sources);

    const newsTab = page.getByRole('button', { name: /^News$/i }).first();
    if (await newsTab.isVisible().catch(() => false)) {
      await newsTab.click();
      await page.waitForTimeout(1500);
    } else {
      const reportBot = page.getByRole('button', { name: /report bot/i }).first();
      if (await reportBot.isVisible().catch(() => false)) {
        await reportBot.click();
        await page.waitForTimeout(1500);
      }
    }
    await page.screenshot({ path: path.join(OUT, FILES.field) });
    console.log('Wrote', FILES.field);
  } finally {
    await context.close();
    await browser.close();
  }
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
