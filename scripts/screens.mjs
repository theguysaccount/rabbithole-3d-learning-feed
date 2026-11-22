// Screenshots of the key screens at desktop and phone sizes, into docs/screens/ (real YouTube player).
//   node scripts/build.mjs && node scripts/screens.mjs [--url <site>]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/screens");
const args = process.argv.slice(2);
const i = args.indexOf("--url");
let server = null, base = i >= 0 ? args[i + 1] : "";
if (!base) { server = await serve(path.join(ROOT, "dist"), 0, "/rabbithole-3d-learning-feed"); base = `http://127.0.0.1:${server.address().port}/rabbithole-3d-learning-feed/`; }
const CHROME = process.env.CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const sizes = { desktop: { width: 1366, height: 900, deviceScaleFactor: 1 }, phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
const settle = (ms = 2500) => new Promise((r) => setTimeout(r, ms));
try {
  for (const [name, vp] of Object.entries(sizes)) {
    const page = await browser.newPage();
    await page.emulate({ viewport: vp, userAgent: name === "phone" ? "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" : await browser.userAgent() });
    await page.goto(base, { waitUntil: "networkidle2" });
    await settle();
    await page.screenshot({ path: path.join(OUT, `home-${name}.png`) });
    await page.evaluate(() => document.getElementById("player").scrollIntoView());
    await page.evaluate(() => { window.__rabbithole.go("ca1", "nav"); });
    await settle(3000);
    await page.screenshot({ path: path.join(OUT, `player-deeper-${name}.png`) });
    await page.goto(base + "build/?from=how-computers-work", { waitUntil: "networkidle2" });
    await settle();
    await page.screenshot({ path: path.join(OUT, `builder-${name}.png`) });
    await page.goto(base + "holes/linear-algebra-visually/", { waitUntil: "networkidle2" });
    await settle();
    await page.screenshot({ path: path.join(OUT, `hole-page-${name}.png`) });
    await page.close();
    console.log(`${name}: done`);
  }
} finally { await browser.close(); server?.close(); }
