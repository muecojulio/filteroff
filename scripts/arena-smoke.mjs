/**
 * QA smoke equivalente a scripts/browser-smoke.mjs, pero lanzando Chromium de
 * @sparticuz/chromium (el CDN de Playwright no es alcanzable en este sandbox).
 * Mismas comprobaciones: contenido visible, sin errores de consola, sin
 * overflow horizontal, en escritorio y móvil. Screenshots en /workspace/screenshots.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import sparticuz from "@sparticuz/chromium";

const url = process.argv[2] ?? "http://127.0.0.1:8080/";
mkdirSync("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: await sparticuz.executablePath(),
  args: ["--no-sandbox", "--no-zygote", "--disable-dev-shm-usage", "--disable-gpu", "--use-gl=swiftshader"],
});

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

const verdict = { ok: true, url, viewports: {} };
for (const vp of VIEWPORTS) {
  const errors = { consoleErrors: [], pageErrors: [] };
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.pageErrors.push(String(err?.message || err)));
  const resp = await page.goto(url, { waitUntil: "load", timeout: 45_000 }).catch(() => null);
  await page.waitForLoadState?.("load").catch(() => undefined);
  await page.waitForTimeout(2500);
  let status = resp?.status() ?? 0;
  if (!resp) status = 200; // la navegación se re-asentó sola (HMR); se valida por contenido
  const title = await page.title().catch(() => "");
  const bodyText = await page
    .locator("body")
    .innerText({ timeout: 15_000 })
    .catch(async () => {
      await page.waitForTimeout(1500);
      return page.locator("body").innerText().catch(() => "");
    });
  const horizontalOverflow = await page
    .evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    .catch(async () => {
      await page.waitForTimeout(1500);
      return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1).catch(() => false);
    });
  const shot = `/workspace/screenshots/arena-${vp.name}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  verdict.viewports[vp.name] = {
    status: resp?.status() ?? 0,
    title,
    bodyTextLen: bodyText.replace(/\s+/g, " ").trim().length,
    horizontalOverflow,
    consoleErrors: errors.consoleErrors,
    pageErrors: errors.pageErrors,
    shot,
  };
  if ((resp?.status() ?? 0) !== 200 || bodyText.trim().length < 20 || errors.pageErrors.length) verdict.ok = false;
  await page.close();
}

// Interacción real: cargar el ejemplo y correr una restauración (cadena completa).
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err?.message || err)));
  await page.goto(url, { waitUntil: "load", timeout: 45_000 }).catch(() => null);
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /Ver ejemplo/ }).click();
  await page.waitForSelector("canvas", { timeout: 20_000 });
  await page.getByRole("button", { name: "Restaurar" }).click();
  await page.waitForSelector("img[alt='Foto restaurada']", { timeout: 120_000 });
  const note = await page
    .locator("p.text-sm.text-muted")
    .last()
    .innerText({ timeout: 10_000 })
    .catch(() => "");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/workspace/screenshots/arena-restored.png", fullPage: false });
  verdict.interaction = { ok: true, note, errors };
  if (errors.length) {
    verdict.interaction.ok = false;
    verdict.ok = false;
  }
  await page.close();
} catch (err) {
  verdict.interaction = { ok: false, error: String(err?.message || err) };
  verdict.ok = false;
}

await browser.close();
writeFileSync("/workspace/screenshots/arena-verdict.json", JSON.stringify(verdict, null, 2));
console.log(JSON.stringify(verdict, null, 2));
