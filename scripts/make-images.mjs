// Draw the share card (site/og.png, 1200x630) and the icon (site/apple-touch-icon.png, 180x180) in
// headless Chrome. The card is drawn from code: a main track of video cards with side paths going
// deeper, no YouTube thumbnails or anyone's artwork.
//   node scripts/make-images.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c" width="1200" height="630"></canvas><canvas id="i" width="180" height="180"></canvas><script>
const c = document.getElementById("c").getContext("2d");
const g = c.createLinearGradient(0, 0, 1200, 630); g.addColorStop(0, "#1d1712"); g.addColorStop(1, "#3b2416");
c.fillStyle = g; c.fillRect(0, 0, 1200, 630);
c.fillStyle = "#fbf8f3"; c.font = "700 66px Georgia, serif"; c.textBaseline = "top";
["Video feeds only", "go down.", "This one goes"].forEach((l, i) => c.fillText(l, 64, 70 + i * 80));
c.fillStyle = "#fb923c"; c.fillText("deeper.", 64, 310);
c.fillStyle = "#e8dfd3"; c.font = "500 28px system-ui, sans-serif";
c.fillText("Turn YouTube videos into a path with side paths.", 64, 430);
c.fillText("Free. No account. One link.", 64, 474);
c.fillStyle = "#b3a89c"; c.font = "700 30px Georgia, serif"; c.fillText("Rabbit Hole", 64, 548);
// A main track (vertical) with side paths going right.
const card = (x, y, w, h, fill, play = true) => {
  c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, 12); c.fill();
  if (play) { c.fillStyle = "rgba(255,255,255,.85)"; c.beginPath(); c.moveTo(x + w / 2 - 10, y + h / 2 - 13); c.lineTo(x + w / 2 + 14, y + h / 2); c.lineTo(x + w / 2 - 10, y + h / 2 + 13); c.closePath(); c.fill(); }
};
const X = 800, W = 150, H = 84;
const ys = [60, 190, 320, 450];
c.strokeStyle = "#fb923c"; c.lineWidth = 6; c.beginPath(); c.moveTo(X + W / 2, ys[0] + H); c.lineTo(X + W / 2, ys[3]); c.stroke();
ys.forEach((y, i) => card(X, y, W, H, i === 1 ? "#c2410c" : "#5b3b2a"));
c.strokeStyle = "#2dd4bf"; c.lineWidth = 5;
c.beginPath(); c.moveTo(X + W, ys[1] + H / 2); c.lineTo(X + W + 40, ys[1] + H / 2); c.stroke();
card(X + W + 40, ys[1], 120, 68, "#0f766e"); card(X + W + 40, ys[1] + 90, 120, 68, "#115e59");
c.beginPath(); c.moveTo(X + W + 100, ys[1] + 68); c.lineTo(X + W + 100, ys[1] + 90); c.stroke();
c.beginPath(); c.moveTo(X + W, ys[3] + H / 2); c.lineTo(X + W + 40, ys[3] + H / 2); c.stroke();
card(X + W + 40, ys[3] + 8, 120, 68, "#0f766e");
const i = document.getElementById("i").getContext("2d");
i.fillStyle = "#c2410c"; i.fillRect(0, 0, 180, 180);
i.strokeStyle = "rgba(255,255,255,.55)"; i.lineWidth = 14; i.beginPath(); i.arc(90, 90, 56, 0, Math.PI * 2); i.stroke();
i.fillStyle = "#fff"; i.beginPath(); i.arc(90, 90, 28, 0, Math.PI * 2); i.fill();
window.out = { og: document.getElementById("c").toDataURL("image/png"), icon: document.getElementById("i").toDataURL("image/png") };
</script>`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: process.env.CI ? ["--no-sandbox"] : [] });
try {
  const page = await browser.newPage();
  await page.setContent(html);
  const out = await page.evaluate(() => window.out);
  fs.writeFileSync(path.join(ROOT, "site/og.png"), Buffer.from(out.og.split(",")[1], "base64"));
  fs.writeFileSync(path.join(ROOT, "site/apple-touch-icon.png"), Buffer.from(out.icon.split(",")[1], "base64"));
  console.log("wrote site/og.png and site/apple-touch-icon.png");
} finally { await browser.close(); }
