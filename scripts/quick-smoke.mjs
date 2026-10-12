#!/usr/bin/env node
/**
 * Smoke test rápido: abre la home y la pantalla /privacidad, captura
 * screenshot y reporta contenido visible + console errors. No usa playwright
 * test runner, solo chromium directo.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL_HOME = process.env.SMOKE_URL ?? "http://127.0.0.1:8080/";
const URL_PRIVACY = process.env.SMOKE_PRIVACY_URL ?? "http://127.0.0.1:8080/privacidad";
const URL_QR = process.env.SMOKE_QR_URL ?? "http://127.0.0.1:8080/qr";
const OUT_DIR = process.env.SMOKE_OUT ?? "/tmp/filteroff-smoke";
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (err) => errors.push({ type: "pageerror", message: err.message }));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push({ type: "console.error", message: msg.text() });
});

const results = [];

async function visit(name, url) {
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    await page.waitForTimeout(800);
    const text = (await page.evaluate(() => document.body.innerText)).slice(0, 2000);
    const screenshotPath = `${OUT_DIR}/${name}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    results.push({
      name,
      url,
      status: response?.status(),
      contentLength: text.length,
      excerpt: text.split("\n").slice(0, 8).join(" | "),
      screenshot: screenshotPath,
    });
  } catch (err) {
    results.push({ name, url, error: err.message });
  }
}

await visit("home", URL_HOME);
await visit("privacidad", URL_PRIVACY);
await visit("qr", URL_QR);

await browser.close();

console.log(JSON.stringify({ ok: errors.length === 0, errors, results }, null, 2));
process.exit(errors.length > 0 ? 1 : 0);
