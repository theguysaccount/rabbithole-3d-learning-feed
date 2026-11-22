// End-to-end self-test in headless Chrome.
//   node scripts/selftest.mjs                      # serves dist/ locally under /rabbithole-3d-learning-feed/
//   node scripts/selftest.mjs --url https://theguysaccount.github.io/rabbithole-3d-learning-feed/
//   options: --report <file.json>  --only pages|player|swipe|builder|embed|youtube  --max-age-days <n>
//            --real-youtube   also load YouTube's real player API and wait for it to be ready
// YouTube is replaced by a stand-in player for the behaviour checks (so a YouTube outage or a
// runner without access can't fail the deploy); --real-youtube checks the real integration.
// Expectations come from the demo paths' own JSON, the sitemap and build.json, never fixed counts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (k, d = "") => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CHROME = process.env.CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
const only = opt("--only");
const want = (part) => !only || only === part;
const report = { started: new Date().toISOString(), checks: [], ok: true };
const check = (name, pass, detail = "") => {
  report.checks.push({ name, pass: !!pass, detail: String(detail) });
  if (!pass) report.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${detail !== "" ? ` (${detail})` : ""}`);
};

let server = null;
let base = opt("--url");
if (!base) {
  server = await serve(path.join(ROOT, "dist"), 0, "/rabbithole-3d-learning-feed");
  base = `http://127.0.0.1:${server.address().port}/rabbithole-3d-learning-feed/`;
}
if (!base.endsWith("/")) base += "/";
const origin = new URL(base).origin;
console.log(`self-test against ${base} with ${CHROME}`);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 300000, args: ["--autoplay-policy=no-user-gesture-required", ...(process.env.CI ? ["--no-sandbox"] : [])] });

// A stand-in for YouTube's IFrame Player API: same calls and events, no network.
const STUB = `(() => {
  const S = window.__ytStub = { players: [] };
  window.YT = { PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }, Player: class {
    constructor(el, o) {
      const node = typeof el === "string" ? document.getElementById(el) : el;
      this.box = document.createElement("div"); this.box.className = "yt-stub"; this.box.textContent = "video " + o.videoId;
      node.replaceWith(this.box); this.o = o; this.video = o.videoId; this.calls = [["create", { videoId: o.videoId, host: o.host, playerVars: o.playerVars }]];
      S.players.push(this); setTimeout(() => o.events && o.events.onReady && o.events.onReady({ target: this }), 30);
    }
    loadVideoById(a) { this.calls.push(["load", a]); this.video = a.videoId; this.box.textContent = "video " + a.videoId; setTimeout(() => this.o.events.onStateChange({ data: 1, target: this }), 20); }
    cueVideoById(a) { this.calls.push(["cue", a]); this.video = a.videoId; this.box.textContent = "video " + a.videoId; }
    destroy() { this.box.remove(); }
    end() { this.o.events.onStateChange({ data: 0, target: this }); }
    fail(code) { this.o.events.onError({ data: code, target: this }); }
  } };
  setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 5);
})();`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const YT_HOSTS = /^https:\/\/(www\.youtube\.com|www\.youtube-nocookie\.com|s\.ytimg\.com|i\.ytimg\.com)\//;

async function open(url, { mobile = false, stub = true } = {}) {
  const page = await browser.newPage();
  const errors = [], offsite = [], youtube = [];
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  if (stub) {
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const u = r.url();
      if (u.startsWith("https://www.youtube.com/iframe_api")) return r.respond({ status: 200, contentType: "text/javascript", body: STUB });
      if (u.startsWith("https://i.ytimg.com/")) return r.respond({ status: 200, contentType: "image/png", body: PNG });
      if (u.startsWith("https://www.youtube.com/oembed")) {
        const id = /v%3D([A-Za-z0-9_-]{11})|v=([A-Za-z0-9_-]{11})/.exec(u);
        const vid = id?.[1] || id?.[2] || "";
        if (vid === "BLOCKEDvid0") return r.respond({ status: 401, headers: { "access-control-allow-origin": "*" }, body: "Unauthorized" });
        return r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ title: `Stub title ${vid}`, author_name: "Stub channel" }) });
      }
      return r.continue();
    });
  }
  page.on("request", (r) => {
    const u = r.url();
    if (r.frame() !== page.mainFrame()) return;           // requests inside YouTube's own player are YouTube's
    if (u.startsWith(origin) || u.startsWith("blob:") || u.startsWith("data:")) return;
    if (YT_HOSTS.test(u)) youtube.push(u); else offsite.push(u);
  });
  if (mobile) await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" });
  else await page.setViewport({ width: 1280, height: 900 });
  const res = await page.goto(url, { waitUntil: "load", timeout: 90000 });
  return { page, errors, offsite, youtube, status: res?.status() };
}

// Videos the embed check found unplayable: the player skips them, so checks never expect them to load.
const builtInfo = await fetch(base + "build.json", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
const bad = new Set(builtInfo.unavailable || []);
const playable = (c) => !bad.has(c.yt);
const holes = Object.fromEntries(fs.readdirSync(path.join(ROOT, "site/holes")).filter((f) => f.endsWith(".json")).map((f) => { const h = JSON.parse(fs.readFileSync(path.join(ROOT, "site/holes", f), "utf8")); return [h.slug, h]; }));
const count = (t) => t.reduce((n, c) => n + 1 + (c.deeper ? count(c.deeper) : 0), 0);
const cur = (page) => page.$eval(".rh", (r) => r.dataset.current);
const stubVideo = (page) => page.evaluate(() => window.__ytStub?.players.at(-1)?.video);

try {
  // 1. Pages from the sitemap.
  if (want("pages")) {
    const sm = await (await fetch(base + "sitemap.xml")).text();
    const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const info = await (await fetch(base + "build.json", { cache: "no-store" })).json();
    const siteRoot = info.base.replace(/\/$/, "") + "/";
    check("sitemap lists pages", locs.length >= 6, `${locs.length} URLs`);
    check("sitemap leaves out the watch and embed players", !locs.some((l) => /\/(watch|embed)\//.test(l)));
    for (const loc of locs) {
      const p = loc.startsWith(siteRoot) ? loc.slice(siteRoot.length) : new URL(loc).pathname.replace(/^\//, "");
      for (const mobile of [false, true]) {
        if (mobile && !(p === "" || p.startsWith("build") || p.startsWith("holes/how"))) continue;
        const { page, errors, offsite, status } = await open(base + p, { mobile });
        const seo = await page.evaluate(() => ({
          title: document.title, canonical: document.querySelector("link[rel=canonical]")?.href || "",
          desc: document.querySelector("meta[name=description]")?.content || "", og: document.querySelector('meta[property="og:image"]')?.content || "",
          csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || "", h1: document.querySelector("h1")?.textContent || "",
          ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { return JSON.parse(s.textContent)["@type"]; } catch { return "BAD"; } }),
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        }));
        const tag = `page /${p}${mobile ? " (phone)" : ""}`;
        if (!mobile) {
          check(`${tag}: loads`, status === 200, `HTTP ${status}`);
          check(`${tag}: title, description, h1, canonical, og:image`, seo.title && seo.desc.length > 50 && seo.h1 && seo.canonical === loc && seo.og, seo.title.slice(0, 70));
          check(`${tag}: CSP limits connections to this site and YouTube`, /connect-src 'self' https:\/\/www\.youtube\.com(;|$| https:\/\/[^\s;]+\.goatcounter\.com)/.test(seo.csp) && /frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/www\.youtube\.com(;|$)/.test(seo.csp), seo.csp.match(/connect-src[^;]*/)?.[0]);
          check(`${tag}: structured data parses`, !seo.ld.includes("BAD"), seo.ld.join(", ") || "none");
        }
        check(`${tag}: no sideways scrolling`, !seo.overflow);
        check(`${tag}: no console errors`, !errors.length, errors.join(" | "));
        check(`${tag}: no requests to sites other than YouTube`, !offsite.length, offsite.join(" "));
        await page.close();
      }
    }
    for (const f of ["robots.txt", "feed.xml", "build.json", "manifest.webmanifest", "og.png", ...Object.keys(holes).map((s) => `holes/${s}.json`)]) {
      const r = await fetch(base + f, { method: "HEAD" });
      check(`/${f} is served`, r.ok, `HTTP ${r.status}`);
    }
    if (opt("--max-age-days")) {
      const age = (Date.now() - Date.parse(info.built)) / 86400000;
      check("live build is fresh", age <= Number(opt("--max-age-days")), `built ${info.built} (${age.toFixed(1)} days ago), commit ${String(info.commit).slice(0, 7)}`);
      report.build = info;
    }
  }

  // 2. The player on the home page: buttons, keys, autoplay, errors, map, link position.
  if (want("player")) {
    const { page, errors, offsite } = await open(base);
    await page.waitForFunction(() => document.querySelector(".rh")?.dataset.yt === "ready", { timeout: 20000 });
    const slug = await page.evaluate(() => JSON.parse(document.getElementById("hole-data").textContent).slug);
    const h = holes[slug];
    check("player: shows the featured path's first clip", (await cur(page)) === h.track[0].id && (await page.evaluate(() => window.__ytStub.players[0].video)) === h.track[0].yt, `${slug} / ${h.track[0].id}`);
    check("player: uses YouTube's privacy-enhanced host", await page.evaluate(() => window.__ytStub.players[0].calls[0][1].host === "https://www.youtube-nocookie.com"));
    const mapItems = await page.$$eval(".rh-map li", (l) => l.length);
    check("player: the map lists every clip", mapItems === count(h.track), `${mapItems} of ${count(h.track)}`);
    await page.click('.rh-nav [data-go="next"]');
    check("player: Next moves down the main track", (await cur(page)) === h.track[1].id && (!playable(h.track[1]) || (await stubVideo(page)) === h.track[1].yt));
    let withDeeper = h.track.findIndex((c) => c.deeper && playable(c) && playable(c.deeper[0]));
    if (withDeeper < 0) withDeeper = h.track.findIndex((c) => c.deeper);
    await page.evaluate((id) => window.__rabbithole.go(id, "nav"), h.track[withDeeper].id);
    await page.click('.rh-nav [data-go="deeper"]');
    const deep = h.track[withDeeper].deeper[0];
    check("player: Go deeper enters the side path", (await cur(page)) === deep.id && (!playable(deep) || (await stubVideo(page)) === deep.yt));
    check("player: breadcrumbs show the way back", (await page.$eval(".rh-crumbs", (n) => n.textContent)).includes(h.track[withDeeper].title));
    check("player: the link remembers the position", (await page.evaluate(() => location.hash)).includes(`at=${deep.id}`));
    await page.click('.rh-nav [data-go="out"]');
    check("player: Back out returns to the clip above", (await cur(page)) === h.track[withDeeper].id);
    await page.focus(".rh-pad");
    await page.keyboard.press("ArrowRight");
    check("player: the right arrow key goes deeper", (await cur(page)) === deep.id);
    await page.keyboard.press("ArrowLeft");
    // Autoplay: when the last clip of a side path ends, the next main-track clip plays.
    const lastDeep = h.track[withDeeper].deeper.at(-1);
    await page.evaluate((id) => window.__rabbithole.go(id, "nav"), lastDeep.id);
    await page.evaluate(() => window.__ytStub.players.at(-1).end());
    const afterId = h.track[withDeeper + 1]?.id;
    if (afterId) check("player: after a side path ends, the main track continues", (await cur(page)) === afterId, await cur(page));
    // A video that can't be embedded: message, link to YouTube, and a skip.
    await page.evaluate(() => { document.querySelector(".rh-auto input").click(); window.__ytStub.players.at(-1).fail(150); });
    const blocked = await page.evaluate(() => ({ shown: !document.querySelector(".rh-blocked").hidden, href: document.querySelector(".rh-blocked a").href }));
    check("player: an unplayable video says so and links to YouTube", blocked.shown && /^https:\/\/www\.youtube\.com\/watch\?v=/.test(blocked.href), blocked.href);
    check("player: no console errors", !errors.length, errors.join(" | "));
    check("player: no requests to sites other than YouTube", !offsite.length, offsite.join(" "));
    await page.close();
  }

  // 3. Swipes on a phone.
  if (want("swipe")) {
    const slug = "how-computers-work";
    const h = holes[slug];
    const { page, errors } = await open(`${base}holes/${slug}/`, { mobile: true });
    await page.waitForFunction(() => document.querySelector(".rh")?.dataset.yt === "ready", { timeout: 20000 });
    const swipe = async (dx, dy) => {
      const box = await (await page.$(".rh-card")).boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.touchscreen.touchStart(x, y);
      await page.touchscreen.touchMove(x + dx / 2, y + dy / 2);
      await page.touchscreen.touchMove(x + dx, y + dy);
      await page.touchscreen.touchEnd();
      await new Promise((r) => setTimeout(r, 120));
    };
    const vbox = await page.$eval(".rh-video", (v) => { const b = v.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; });
    check("swipe: YouTube's player gets at least 200 x 200 pixels on a phone", vbox.w >= 200 && vbox.h >= 200, `${vbox.w}x${vbox.h}`);
    await page.evaluate(() => document.querySelector(".rh-pad").scrollIntoView({ block: "center" }));
    await swipe(0, -120);
    check("swipe: up moves to the next clip", (await cur(page)) === h.track[1].id, await cur(page));
    const k = h.track.findIndex((c) => c.deeper);
    await page.evaluate((id) => window.__rabbithole.go(id, "nav"), h.track[k].id);
    await swipe(-140, 0);
    check("swipe: left goes deeper", (await cur(page)) === h.track[k].deeper[0].id, await cur(page));
    await swipe(140, 0);
    check("swipe: right backs out", (await cur(page)) === h.track[k].id, await cur(page));
    await swipe(0, 120);
    check("swipe: down goes back one clip", (await cur(page)) === h.track[k - 1].id, await cur(page));
    check("swipe: no console errors", !errors.length, errors.join(" | "));
    await page.close();
  }

  // 4. The builder: add, nest, reorder, drag, share, and open the shared link.
  if (want("builder")) {
    const { page, errors, offsite } = await open(base + "build/");
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    const add = async (url) => { await page.$eval("#b-url", (i) => { i.value = ""; }); await page.type("#b-url", url); await page.click('#b-add button[type="submit"]'); await page.waitForFunction((n) => document.querySelectorAll("#b-tree [data-id]").length >= n || document.getElementById("b-error").textContent, { timeout: 10000 }, 0); await new Promise((r) => setTimeout(r, 150)); };
    await page.type("#b-title", "Self-test path");
    await add("https://www.youtube.com/watch?v=aircAruvnKk&t=30s");
    await add("https://youtu.be/IHZwWFHWa-w");
    await add("https://www.youtube.com/shorts/Ilg3gGewQ5U");
    let hole = await page.evaluate(() => window.__builder.hole);
    check("builder: three links make a main track of three", hole.track.length === 3, hole.track.map((c) => c.yt).join(" "));
    check("builder: titles come from YouTube's oEmbed", hole.track[1].title === "Stub title IHZwWFHWa-w", hole.track[1].title);
    check("builder: a timestamp in the link becomes the start time", hole.track[0].start === 30);
    await add("https://www.youtube.com/watch?v=BLOCKEDvid0");
    const err = await page.$eval("#b-error", (e) => e.textContent);
    check("builder: a video that can't be embedded is refused with a reason", /doesn't allow/.test(err) && (await page.evaluate(() => window.__builder.hole.track.length)) === 3, err);
    await add("not a link at all");
    check("builder: a non-YouTube link is refused", /isn't a YouTube video link/.test(await page.$eval("#b-error", (e) => e.textContent)));
    const firstId = hole.track[0].id;
    await page.click(`#b-tree [data-id="${firstId}"] [data-act="deeper"]`);
    await add("https://www.youtube.com/watch?v=fNk_zzaMoSs");
    hole = await page.evaluate(() => window.__builder.hole);
    check("builder: + Deeper adds to that clip's deeper track", hole.track[0].deeper?.[0]?.yt === "fNk_zzaMoSs");
    const third = hole.track[2].id;
    await page.click(`#b-tree [data-id="${third}"] > .b-clip [data-act="up"]`);
    hole = await page.evaluate(() => window.__builder.hole);
    check("builder: ↑ moves a clip up its track", hole.track[1].id === third);
    await page.click(`#b-tree [data-id="${third}"] > .b-clip [data-act="indent"]`);
    hole = await page.evaluate(() => window.__builder.hole);
    check("builder: ⇥ moves a clip into the deeper track above it", hole.track.length === 2 && hole.track[0].deeper.at(-1).id === third);
    // Drag the last main clip into the first clip's deeper track (drop on its middle).
    const lastMain = hole.track.at(-1).id;
    const from = await (await page.$(`#b-tree [data-id="${lastMain}"] > .b-clip .b-handle`)).boundingBox();
    const to = await (await page.$(`#b-tree [data-id="${firstId}"] > .b-clip`)).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    hole = await page.evaluate(() => window.__builder.hole);
    check("builder: drag and drop onto a clip moves it into that clip's deeper track", hole.track.length === 1 && hole.track[0].deeper.some((c) => c.id === lastMain), JSON.stringify(hole.track.map((c) => [c.id, (c.deeper || []).map((d) => d.id)])));
    await page.click("#b-undo");
    check("builder: Undo reverses the last change", (await page.evaluate(() => window.__builder.hole.track.length)) === 2);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__builder?.hole?.track?.length >= 1, { timeout: 10000 });
    check("builder: the draft survives a reload", (await page.evaluate(() => window.__builder.hole.title)) === "Self-test path");
    await page.waitForFunction(() => window.__builder.shareUrl, { timeout: 10000 });
    const shareUrl = await page.evaluate(() => window.__builder.shareUrl);
    const built = await page.evaluate(() => window.__builder.hole);
    check("builder: a share link holds the path", /\/watch\/#h=1[zj]\.[A-Za-z0-9_-]+$/.test(shareUrl), shareUrl.slice(0, 90) + "…");
    // The refused video's oEmbed answer (401) is logged by the browser itself; that one is expected.
    const real = errors.filter((e) => !/status of 401/.test(e));
    check("builder: no console errors", !real.length, real.join(" | "));
    check("builder: no requests to sites other than YouTube", !offsite.length, offsite.join(" "));
    await page.close();
    // Open the link's "watch/#h=..." tail on the site under test; works on a project path and on a root domain.
    const w = await open(base + shareUrl.slice(shareUrl.lastIndexOf("/watch/") + 1));
    await w.page.waitForFunction(() => document.querySelector(".rh")?.dataset.yt === "ready", { timeout: 20000 });
    const seen = await w.page.evaluate(() => ({ title: document.querySelector(".rh-hole-title").textContent, items: document.querySelectorAll(".rh-map li").length }));
    check("watch: the shared link opens the same path", seen.title === built.title && seen.items === count(built.track), `${seen.title}, ${seen.items} clips`);
    check("watch: no console errors", !w.errors.length, w.errors.join(" | "));
    await w.page.close();
    const bad = await open(`${base}watch/#h=1z.not-a-real-path`);
    await bad.page.waitForSelector("#watch-status:not([hidden])", { timeout: 10000 });
    check("watch: a damaged link explains itself", /damaged|doesn't contain/.test(await bad.page.$eval("#watch-status", (e) => e.textContent)));
    await bad.page.close();
  }

  // 5. The embed player.
  if (want("embed")) {
    const slug = Object.keys(holes)[0];
    const { page, errors } = await open(`${base}embed/?hole=${slug}`);
    await page.waitForFunction(() => document.querySelector(".rh")?.dataset.yt === "ready", { timeout: 20000 });
    const e = await page.evaluate(() => ({ header: !!document.querySelector("header.site"), items: document.querySelectorAll(".rh-map li").length, robots: document.querySelector('meta[name="robots"]')?.content }));
    check("embed: plays a demo path without the site's header", !e.header && e.items === count(holes[slug].track), `${e.items} clips`);
    check("embed: kept out of search results", e.robots === "noindex");
    check("embed: no console errors", !errors.length, errors.join(" | "));
    await page.close();
  }

  // 6. The real YouTube player API (network): loads, and the player reports ready.
  if (want("youtube") && (args.includes("--real-youtube") || only === "youtube")) {
    const { page, errors, offsite } = await open(base, { stub: false });
    const t0 = Date.now();
    const state = await page.waitForFunction(() => ["ready", "failed"].includes(document.querySelector(".rh")?.dataset.yt) && document.querySelector(".rh").dataset.yt, { timeout: 60000 }).then((h) => h.jsonValue()).catch(() => "timeout");
    const frame = await page.evaluate(() => document.querySelector(".rh-video iframe")?.src || "");
    check("youtube: the real player API loads and the player is ready", state === "ready", `${state} after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    check("youtube: the player is served from youtube-nocookie.com", frame.startsWith("https://www.youtube-nocookie.com/embed/"), frame.slice(0, 80));
    check("youtube: no requests to sites other than YouTube", !offsite.length, offsite.join(" "));
    void errors;
    await page.close();
  }
} catch (e) {
  check("self-test ran to the end", false, String((e && e.stack) || e).slice(0, 800));
} finally {
  await browser.close();
  server?.close();
  report.finished = new Date().toISOString();
  if (opt("--report")) fs.writeFileSync(opt("--report"), JSON.stringify(report, null, 2));
  console.log(report.ok ? "SELF-TEST PASSED" : "SELF-TEST FAILED");
  process.exitCode = report.ok ? 0 : 1;
}
