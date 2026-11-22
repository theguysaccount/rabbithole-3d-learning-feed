// Build tests: the site builds for any base URL and date, every sitemap page exists with its tags,
// internal links resolve, guides publish by date, demo pages credit and link every video, and
// unplayable videos are marked. Expected values come from the content files, not fixed counts.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { frontMatter } from "../scripts/lib/markdown.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const today = new Date().toISOString().slice(0, 10);
const guides = fs.readdirSync(path.join(ROOT, "content/guides")).filter((f) => f.endsWith(".md")).map((f) => ({ slug: f.replace(/\.md$/, ""), ...frontMatter(fs.readFileSync(path.join(ROOT, "content/guides", f), "utf8")).meta }));
const holes = fs.readdirSync(path.join(ROOT, "site/holes")).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, "site/holes", f), "utf8")));

function build(base, date, extraEnv = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "rh-build-"));
  const urls = path.join(out, "urls.txt");
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: ROOT, env: { ...process.env, BASE_URL: base, BUILD_DATE: date, OUT_DIR: path.join(out, "dist"), URLS_OUT: urls, GOATCOUNTER_URL: "", PRO_URL: "", SUPPORT_URL: "", ...extraEnv }, stdio: "pipe" });
  return { dir: path.join(out, "dist"), urls: fs.readFileSync(urls, "utf8").trim().split("\n"), cleanup: () => fs.rmSync(out, { recursive: true, force: true }) };
}
const htmlFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === "assets" ? [] : htmlFiles(path.join(dir, e.name))) : e.name.endsWith(".html") ? [path.join(dir, e.name)] : []);

test("every sitemap page exists with canonical, title, description, CSP and valid JSON-LD", () => {
  const base = "https://example.test/sub";
  const b = build(base, today);
  try {
    const locs = [...fs.readFileSync(path.join(b.dir, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(locs, b.urls);
    for (const h of holes) assert.ok(locs.includes(`${base}/holes/${h.slug}/`), h.slug);
    assert.ok(!locs.some((l) => /\/(watch|embed)\//.test(l)), "players for shared links stay out of the sitemap");
    for (const loc of locs) {
      const rel = loc.slice(base.length);
      const html = fs.readFileSync(path.join(b.dir, rel, "index.html"), "utf8");
      assert.ok(html.includes(`<link rel="canonical" href="${loc}">`), rel);
      assert.match(html, /<title>[^<]{10,}<\/title>/);
      assert.match(html, /<meta name="description" content="[^"]{50,}">/);
      assert.match(html, /frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/www\.youtube\.com;/);
      assert.ok(!/\{\{\w+\}\}/.test(html), `placeholder left on ${rel}`);
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
    }
    for (const p of ["watch", "embed"]) assert.match(fs.readFileSync(path.join(b.dir, p, "index.html"), "utf8"), /<meta name="robots" content="noindex">/);
    assert.match(fs.readFileSync(path.join(b.dir, "robots.txt"), "utf8"), new RegExp(`Sitemap: ${base}/sitemap.xml`));
    const key = fs.readFileSync(path.join(ROOT, "site/indexnow-key.txt"), "utf8").trim();
    assert.equal(fs.readFileSync(path.join(b.dir, `${key}.txt`), "utf8"), key);
    assert.equal(JSON.parse(fs.readFileSync(path.join(b.dir, "build.json"), "utf8")).base, base);
  } finally { b.cleanup(); }
});

test("internal links and assets resolve", () => {
  const b = build("https://example.test/sub", today);
  try {
    const missing = [];
    for (const file of htmlFiles(b.dir)) {
      const html = fs.readFileSync(file, "utf8");
      for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        let u = m[1].replace(/[?#].*$/, "");
        if (!u || /^(https?:|mailto:|data:|#)/.test(m[1])) {
          if (u.startsWith("https://example.test/sub/")) u = path.join(b.dir, u.slice("https://example.test/sub/".length));
          else continue;
        } else u = path.resolve(path.dirname(file), u);
        const target = fs.existsSync(u) && fs.statSync(u).isDirectory() ? path.join(u, "index.html") : u;
        if (!fs.existsSync(target)) missing.push(`${path.relative(b.dir, file)} -> ${m[1]}`);
      }
    }
    assert.deepEqual(missing, []);
  } finally { b.cleanup(); }
});

test("demo pages carry their data, credit each video and link it on YouTube", () => {
  const b = build("https://example.test", today);
  try {
    for (const h of holes) {
      const html = fs.readFileSync(path.join(b.dir, "holes", h.slug, "index.html"), "utf8");
      const data = JSON.parse(/<script type="application\/json" id="hole-data">([\s\S]*?)<\/script>/.exec(html)[1]);
      assert.equal(data.slug, h.slug);
      const ids = [];
      (function w(t) { for (const c of t) { ids.push(c.yt); if (c.deeper) w(c.deeper); } })(h.track);
      for (const id of ids) assert.ok(html.includes(`https://www.youtube.com/watch?v=${id}`), `${h.slug}: link to ${id}`);
      assert.ok(fs.existsSync(path.join(b.dir, "holes", `${h.slug}.json`)));
    }
  } finally { b.cleanup(); }
});

test("a video marked unplayable by the embed check is flagged on its page", () => {
  const avail = JSON.parse(fs.readFileSync(path.join(ROOT, "data/availability.json"), "utf8"));
  const victim = holes[0].track[0].yt;
  avail.videos[victim] = { ok: false, status: 401, confirmed: new Date().toISOString() };
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rh-avail-")), "availability.json");
  fs.writeFileSync(tmp, JSON.stringify(avail));
  const b = build("https://example.test", today, { AVAILABILITY_FILE: tmp });
  try {
    const html = fs.readFileSync(path.join(b.dir, "holes", holes[0].slug, "index.html"), "utf8");
    assert.ok(html.includes(`data-unavailable='["${victim}"`), "player told to skip it");
    assert.ok(html.includes("no longer playable here"));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(b.dir, "build.json"), "utf8")).unavailable, [victim]);
  } finally {
    b.cleanup();
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
});

test("guides publish on their date and only published ones are listed", () => {
  const dates = guides.map((g) => g.publish).sort();
  const early = build("https://example.test", new Date(Date.parse(dates[0]) - 86400000).toISOString().slice(0, 10));
  try { assert.ok(!fs.existsSync(path.join(early.dir, "guides", guides[0].slug))); } finally { early.cleanup(); }
  const late = build("https://example.test", "2999-01-01");
  try { for (const g of guides) assert.ok(fs.existsSync(path.join(late.dir, "guides", g.slug, "index.html")), g.slug); } finally { late.cleanup(); }
  const now = build("https://example.test", today);
  try {
    const sm = fs.readFileSync(path.join(now.dir, "sitemap.xml"), "utf8");
    for (const g of guides) assert.equal(sm.includes(`/guides/${g.slug}/`), g.publish <= today, g.slug);
    for (const g of guides) assert.ok(g.title && g.description?.length >= 50 && /^\d{4}-\d{2}-\d{2}$/.test(g.publish), g.slug);
  } finally { now.cleanup(); }
});

test("the page code talks only to this site and YouTube", () => {
  for (const f of fs.readdirSync(path.join(ROOT, "site/assets/js"))) {
    const src = fs.readFileSync(path.join(ROOT, "site/assets/js", f), "utf8").replace(/\/\/[^\n]*$/gm, "");
    for (const m of src.matchAll(/https:\/\/([a-z0-9.-]+)/g)) assert.ok(/^(www\.youtube\.com|www\.youtube-nocookie\.com|i\.ytimg\.com)$/.test(m[1]), `${f}: ${m[1]}`);
  }
});
