// Build the static site into dist/: landing pages, the builder, the shared-link player, the embed
// player, one page per demo rabbit hole, guides published by date, sitemap, robots.txt, feed,
// IndexNow key, build.json (for the staleness check) and dist-urls.txt (for IndexNow).
//
//   BASE_URL=https://theguysaccount.github.io/rabbithole-3d-learning-feed node scripts/build.mjs
//
// BASE_URL is the one setting that decides the site's address. The deploy sets it from the
// repository variable SITE_URL, or the GitHub Pages address when SITE_URL is empty.
// Optional: GOATCOUNTER_URL (counts), SUPPORT_URL (footer link), PRO_URL (paid tier slot),
// BUILD_DATE (YYYY-MM-DD: guides dated later stay unpublished).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { markdown, frontMatter, escapeHtml as esc } from "./lib/markdown.mjs";
import { sanitize, stats, watchUrl, formatTime } from "../site/assets/js/hole.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const OUT = path.resolve(ROOT, process.env.OUT_DIR || "dist");
const BASE = (process.env.BASE_URL || "http://127.0.0.1:4337/rabbithole-3d-learning-feed").replace(/\/$/, "");
const COUNTER = (process.env.GOATCOUNTER_URL || "").trim();
const SUPPORT = (process.env.SUPPORT_URL || "").trim();
const PRO = (process.env.PRO_URL || "").trim();
const TODAY = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);
const NAME = "Rabbit Hole";
const REPO = "https://github.com/theguysaccount/rabbithole-3d-learning-feed";
const KEY = fs.readFileSync(path.join(SITE, "indexnow-key.txt"), "utf8").trim();
const ASSET_V = Date.now().toString(36);

for (const u of [COUNTER, SUPPORT, PRO]) if (u && !/^https:\/\/[^\s"'<>]+$/.test(u)) throw new Error(`Not an https URL: ${u}`);
if (!/^https?:\/\/[^\s"'<>]+$/.test(BASE)) throw new Error(`BASE_URL must be an http(s) URL: ${BASE}`);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(SITE, "assets"), path.join(OUT, "assets"), { recursive: true });
for (const f of ["favicon.svg", "apple-touch-icon.png", "og.png", "manifest.webmanifest"]) {
  if (fs.existsSync(path.join(SITE, f))) fs.copyFileSync(path.join(SITE, f), path.join(OUT, f));
}

// ---------- demo holes and their availability (data/availability.json, kept by the embed check) ----------
const AVAIL_FILE = path.resolve(ROOT, process.env.AVAILABILITY_FILE || "data/availability.json");
const avail = fs.existsSync(AVAIL_FILE) ? JSON.parse(fs.readFileSync(AVAIL_FILE, "utf8")) : { videos: {} };
const unavailable = new Set(Object.entries(avail.videos || {}).filter(([, v]) => v.ok === false).map(([id]) => id));
const holes = fs.readdirSync(path.join(SITE, "holes")).filter((f) => f.endsWith(".json")).sort().map((f) => {
  const raw = JSON.parse(fs.readFileSync(path.join(SITE, "holes", f), "utf8"));
  for (const k of ["slug", "title", "description"]) if (!raw[k]) throw new Error(`${f}: missing ${k}`);
  const { hole, errors } = sanitize(raw);
  if (errors.length) throw new Error(`${f}: ${errors.join(" ")}`);
  return { ...hole, slug: raw.slug, description: raw.description };
}).sort((a, b) => (a.slug === "how-neural-networks-learn" ? -1 : b.slug === "how-neural-networks-learn" ? 1 : a.title.localeCompare(b.title)));
fs.mkdirSync(path.join(OUT, "holes"), { recursive: true });
for (const h of holes) fs.writeFileSync(path.join(OUT, "holes", `${h.slug}.json`), JSON.stringify(h));
const featured = holes[0];

const pages = [];
const rel = (p, depth) => (depth ? "../".repeat(depth) : "./") + p;
const NAV = [["", "Home"], ["build/", "Build one"], ["holes/", "Demo paths"], ["guides/", "Guides"], ["privacy/", "Privacy"]];

function csp() {
  const counter = COUNTER ? " " + new URL(COUNTER).origin : "";
  return [
    "default-src 'self'", "script-src 'self' https://www.youtube.com https://s.ytimg.com", "style-src 'self'",
    "img-src 'self' data: https://i.ytimg.com", "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
    `connect-src 'self' https://www.youtube.com${counter}`, "font-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  ].join("; ");
}

function layout({ urlPath, title, description, body, jsonld = [], script = "", ogType = "website", current = "", noindex = false, embed = false }) {
  const depth = urlPath.split("/").filter(Boolean).length;
  const canonical = BASE + urlPath;
  const a = (p) => rel(p, depth);
  const head = `<!doctype html>
<html lang="en"${COUNTER ? ` data-counter="${esc(COUNTER)}"` : ""}${embed ? ' data-embed="1"' : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp()}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`}
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${BASE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A map of video clips branching sideways and deeper from a main track">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#fbf8f3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121016" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${a("favicon.svg")}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${a("apple-touch-icon.png")}">
<link rel="manifest" href="${a("manifest.webmanifest")}">
<link rel="alternate" type="application/atom+xml" title="${NAME} guides" href="${BASE}/feed.xml">
<link rel="preconnect" href="https://www.youtube-nocookie.com">
<link rel="stylesheet" href="${a("assets/css/app.css")}?v=${ASSET_V}">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>`;
  if (embed) return `${head}
<body class="embed">
<main id="main">
${body}
</main>
${script ? `<script type="module" src="${a(`assets/js/${script}.js`)}?v=${ASSET_V}"></script>` : ""}
</body>
</html>
`;
  return `${head}
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="wrap">
<header class="site">
  <a class="brand" href="${a("")}" aria-label="${NAME} home"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="currentColor"/><circle cx="16" cy="16" r="9" fill="none" stroke="#fff" stroke-width="2.5" opacity=".55"/><circle cx="16" cy="16" r="4.5" fill="#fff"/></svg>${NAME}</a>
  <nav class="top" aria-label="Main">${NAV.map(([p, l]) => `<a href="${a(p)}"${current === p ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
</header>
<main id="main">
${body}
</main>
<footer class="site">
  <nav aria-label="Footer">${NAV.map(([p, l]) => `<a href="${a(p)}">${l}</a>`).join("")}<a href="${a("branching-video/")}">Branching video</a><a href="${a("interactive-youtube-playlist/")}">Interactive YouTube playlists</a><a href="${REPO}">Source code</a>${SUPPORT ? `<a href="${esc(SUPPORT)}" rel="noopener">Support this free tool</a>` : ""}</nav>
  <p>${NAME} arranges YouTube videos into paths you can explore. Videos play in YouTube's own player and stay on YouTube; nothing is downloaded or re-hosted. Free, no account, open source (MIT). Not affiliated with YouTube or the video creators.</p>
</footer>
</div>
<script type="module" src="${a("assets/js/page.js")}?v=${ASSET_V}"></script>
${script ? `<script type="module" src="${a(`assets/js/${script}.js`)}?v=${ASSET_V}"></script>` : ""}
</body>
</html>
`;
}

function write(urlPath, html, { priority = 0.6, lastmod = TODAY, title = "", index = true } = {}) {
  const file = path.join(OUT, urlPath, urlPath.endsWith(".html") ? "" : "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  if (index && !urlPath.endsWith(".html")) pages.push({ path: urlPath, priority, lastmod, title });
}

const crumbs = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: BASE + p })) });
function faqLd(html) {
  const items = [...html.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)];
  if (!items.length) return null;
  const text = (h) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((m) => ({ "@type": "Question", name: text(m[1]), acceptedAnswer: { "@type": "Answer", text: text(m[2]) } })) };
}
const appLd = (urlPath, name, description) => ({ "@context": "https://schema.org", "@type": "WebApplication", name, url: BASE + urlPath, description, applicationCategory: "EducationalApplication", operatingSystem: "Any (runs in a web browser)", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, isAccessibleForFree: true });

// A player block with a hole's data inline (no extra request, works without JavaScript for the outline).
function playerBlock(h, depth, { heading = true } = {}) {
  const bad = [];
  (function w(t) { for (const c of t) { if (unavailable.has(c.yt)) bad.push(c.yt); if (c.deeper) w(c.deeper); } })(h.track);
  const data = JSON.stringify({ v: 1, slug: h.slug, title: h.title, about: h.about, track: h.track }).replace(/</g, "\\u003c");
  return `<section class="player-wrap"${heading ? "" : ' aria-label="Rabbit hole player"'}>
<div id="player" class="rh-root" data-base="${rel(`holes/${h.slug}/`, depth)}" data-build="${rel("build/", depth)}" data-embed="${rel("embed/", depth)}" data-unavailable='${JSON.stringify(bad)}'><noscript><p>The player needs JavaScript. The clips are listed below with links to YouTube.</p></noscript></div>
<script type="application/json" id="hole-data">${data}</script>
</section>`;
}

function outline(h) {
  const item = (c) => {
    const a = avail.videos?.[c.yt];
    const by = a?.author ? ` <span class="by">by ${esc(a.author)}</span>` : "";
    const time = c.start || c.end ? ` <span class="by">(${formatTime(c.start || 0)}–${c.end ? formatTime(c.end) : "end"})</span>` : "";
    return `<li><a href="${esc(watchUrl(c))}" rel="noopener">${esc(c.title)}</a>${by}${time}${unavailable.has(c.yt) ? ' <span class="gone">(no longer playable here)</span>' : ""}${c.note ? `<br><span class="note">${esc(c.note)}</span>` : ""}${c.deeper ? `<p class="deeper-label">Go deeper:</p><ol>${c.deeper.map(item).join("")}</ol>` : ""}</li>`;
  };
  return `<ol class="outline">${h.track.map(item).join("")}</ol>`;
}

function holeCards(fromDepth) {
  return `<ul class="cards holes">${holes.map((h) => { const s = stats(h); return `<li><a href="${rel(`holes/${h.slug}/`, fromDepth)}"><img src="https://i.ytimg.com/vi/${h.track[0].yt}/mqdefault.jpg" alt="" width="320" height="180" loading="lazy"><b>${esc(h.title)}</b><span>${s.clips} clips, ${s.depth} levels deep. ${esc(h.about || "")}</span></a></li>`; }).join("")}</ul>`;
}

// ---------- guides ----------
function loadGuides() {
  const dir = path.join(ROOT, "content", "guides");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => {
    const { meta, body } = frontMatter(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const k of ["title", "description", "publish"]) if (!meta[k]) throw new Error(`${f}: missing ${k}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.publish)) throw new Error(`${f}: publish must be YYYY-MM-DD`);
    return { ...meta, slug: f.replace(/\.md$/, ""), body };
  }).sort((a, b) => (a.publish === b.publish ? a.slug.localeCompare(b.slug) : a.publish < b.publish ? 1 : -1));
}
const guideList = loadGuides();
const published = guideList.filter((g) => g.publish <= TODAY);
const guideCards = (list, fromPath) => `<ul class="cards">${list.map((g) => `<li><a href="${rel(`guides/${g.slug}/`, fromPath.split("/").filter(Boolean).length)}"><b>${esc(g.title)}</b><span>${esc(g.description)}</span></a></li>`).join("")}</ul>`;

// ---------- pages from site/pages/*.html (JSON front matter in a leading comment) ----------
for (const f of fs.readdirSync(path.join(SITE, "pages")).filter((f) => f.endsWith(".html")).sort()) {
  const src = fs.readFileSync(path.join(SITE, "pages", f), "utf8");
  const m = /^<!--(\{[\s\S]*?\})-->\s*/.exec(src);
  if (!m) throw new Error(`${f}: missing front matter`);
  const meta = JSON.parse(m[1]);
  const depth = meta.path.split("/").filter(Boolean).length;
  let content = src.slice(m[0].length)
    .replace(/\{\{root\}\}/g, rel("", depth))
    .replace(/\{\{guides\}\}/g, () => guideCards(published.slice(0, 6), meta.path))
    .replace(/\{\{holes\}\}/g, () => holeCards(depth))
    .replace(/\{\{featured\}\}/g, () => playerBlock(featured, depth))
    .replace(/\{\{featuredTitle\}\}/g, esc(featured.title))
    .replace(/\{\{counterNote\}\}/g, COUNTER ? " and a cookieless visit counter that receives only page addresses and event names" : "")
    .replace(/\{\{counterPolicy\}\}/g, COUNTER
      ? "This site counts visits and a few anonymous events, such as \u201ca rabbit hole was shared\u201d, with GoatCounter, which sets no cookies. It never receives the contents of a rabbit hole, its link or anything you type. Counting is skipped when your browser sends Do Not Track or Global Privacy Control."
      : "This site doesn't count visits at the moment. If counting is switched on later, it will be cookieless, it will never receive the contents of a rabbit hole or anything you type, and it will be skipped when your browser sends Do Not Track or Global Privacy Control.");
  const jsonld = [];
  if (meta.app) jsonld.push(appLd(meta.path, meta.app, meta.description));
  const faq = faqLd(content); if (faq) jsonld.push(faq);
  if (meta.crumb) jsonld.push(crumbs([[NAME, "/"], [meta.crumb, meta.path]]));
  if (meta.howto) jsonld.push({ "@context": "https://schema.org", "@type": "HowTo", name: meta.howto.name, step: meta.howto.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s })) });
  if (PRO && meta.pro) content += `<aside class="slot"><b>Need path analytics, private paths or your own clips?</b> <a href="${esc(PRO)}" rel="noopener">See ${NAME} for creators</a>.</aside>`;
  write(meta.path, layout({ urlPath: meta.path, title: meta.title, description: meta.description, body: content, jsonld, script: meta.script || "", current: meta.nav ?? meta.path.slice(1), noindex: !!meta.noindex, embed: !!meta.embed }), { priority: meta.priority ?? 0.8, title: meta.title, index: !meta.noindex });
}

// ---------- one page per demo hole ----------
for (const h of holes) {
  const urlPath = `/holes/${h.slug}/`;
  const s = stats(h);
  const body = `<section class="prose wide">
<p class="crumbs"><a href="../../">${NAME}</a> › <a href="../">Demo paths</a></p>
<h1>${esc(h.title)}</h1>
<p class="lede">${esc(h.about || h.description)}</p>
</section>
${playerBlock(h, 2)}
<section class="prose">
<h2>The path, clip by clip</h2>
<p>${s.clips} videos: the main track runs top to bottom; indented clips are the go-deeper side paths. Every video plays in YouTube's own player and belongs to its creator; follow the links to watch on YouTube.</p>
${outline(h)}
<aside class="slot"><b>Make your own version.</b> <a href="../../build/?from=${h.slug}">Remix this path in the builder</a>, or <a href="../../build/">start from scratch</a>. It's free and needs no account.</aside>
</section>`;
  const firstVideos = [];
  (function w(t) { for (const c of t) { firstVideos.push(c); if (c.deeper) w(c.deeper); } })(h.track);
  const jsonld = [
    { "@context": "https://schema.org", "@type": "ItemList", name: h.title, description: h.description, numberOfItems: firstVideos.length,
      itemListElement: firstVideos.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: watchUrl(c), name: c.title })) },
    crumbs([[NAME, "/"], ["Demo paths", "/holes/"], [h.title, urlPath]]),
  ];
  write(urlPath, layout({ urlPath, title: `${h.title}: a branching video path · ${NAME}`, description: h.description, body, jsonld, script: "demo", current: "holes/" }), { priority: 0.7, title: h.title });
}
write("/holes/", layout({
  urlPath: "/holes/", title: `Demo rabbit holes: branching paths through YouTube videos · ${NAME}`,
  description: "Example rabbit holes built from embeddable educational YouTube videos: neural networks, how computers work, and linear algebra, each with a main track and go-deeper side paths.",
  body: `<section class="prose"><p class="crumbs"><a href="../">${NAME}</a> › Demo paths</p><h1>Demo paths</h1><p class="lede">Each one is a main track of videos with side paths that go deeper. Open one, swipe or use the arrow keys, and remix it into your own.</p></section>${holeCards(1)}`,
  jsonld: [crumbs([[NAME, "/"], ["Demo paths", "/holes/"]])], current: "holes/",
}), { priority: 0.6 });

// ---------- guides ----------
for (const g of published) {
  const urlPath = `/guides/${g.slug}/`;
  const others = published.filter((x) => x.slug !== g.slug).slice(0, 4);
  // {{site}} is this site's own address (BASE_URL), so guides never hard-code one.
  const html = markdown(g.body.replaceAll("{{site}}", BASE)).replace(/\{\{root\}\}/g, "../../");
  const body = `<article class="prose">
<p class="crumbs"><a href="../../">${NAME}</a> › <a href="../">Guides</a></p>
<h1>${esc(g.title)}</h1>
<p class="meta">Published ${g.publish}${g.updated ? ` · updated ${g.updated}` : ""}</p>
${html}
<aside class="slot"><b>Try it.</b> <a href="../../${g.tool || "build/"}">${esc(g.cta || "Build a rabbit hole from YouTube videos")}</a>. Free, no account.</aside>
</article>
${others.length ? `<section class="band"><h2>More guides</h2>${guideCards(others, urlPath)}</section>` : ""}`;
  const jsonld = [
    { "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.description, datePublished: g.publish, dateModified: g.updated || g.publish, mainEntityOfPage: BASE + urlPath, image: `${BASE}/og.png`, author: { "@type": "Organization", name: NAME, url: BASE + "/" }, publisher: { "@type": "Organization", name: NAME, url: BASE + "/" } },
    crumbs([[NAME, "/"], ["Guides", "/guides/"], [g.title, urlPath]]),
  ];
  const faq = faqLd(html); if (faq) jsonld.push(faq);
  write(urlPath, layout({ urlPath, title: `${g.title} · ${NAME}`, description: g.description, body, jsonld, ogType: "article", current: "guides/" }), { priority: 0.6, lastmod: g.updated || g.publish, title: g.title });
}
write("/guides/", layout({
  urlPath: "/guides/", title: `Guides: branching video, courses and YouTube paths · ${NAME}`,
  description: "Practical guides to building branching video paths from YouTube clips: structuring a course, choosing start and end times, embedding, and what YouTube's embed rules allow.",
  body: `<section class="prose"><p class="crumbs"><a href="../">${NAME}</a> › Guides</p><h1>Guides</h1><p class="lede">How to turn existing videos into a path people want to explore.</p></section>${guideCards(published, "/guides/")}`,
  jsonld: [crumbs([[NAME, "/"], ["Guides", "/guides/"]])], current: "guides/",
}), { priority: 0.5 });

// ---------- 404, sitemap, robots, feed, IndexNow, build.json ----------
write("404.html", layout({
  urlPath: "/404/", title: `Page not found · ${NAME}`, description: "This page doesn't exist.", noindex: true,
  body: `<section class="prose"><h1>That page isn't here.</h1><p><a href="${BASE}/">Go to the home page</a>, <a href="${BASE}/build/">build a rabbit hole</a> or <a href="${BASE}/holes/">try a demo path</a>.</p></section>`,
}).replace(/(href|src)="(?:\.\.\/)+/g, `$1="${BASE}/`).replace(/(href|src)="\.\/(?!\/)/g, `$1="${BASE}/`), { index: false });

const urls = pages.map((p) => BASE + p.path);
fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${BASE}${p.path}</loc><lastmod>${p.lastmod}</lastmod><priority>${p.priority.toFixed(1)}</priority></url>`).join("\n")}
</urlset>
`);
fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /embed/\nDisallow: /watch/\n\nSitemap: ${BASE}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, `${KEY}.txt`), KEY);
fs.writeFileSync(path.join(OUT, "feed.xml"), `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${NAME} guides</title>
  <link href="${BASE}/guides/"/>
  <link rel="self" href="${BASE}/feed.xml"/>
  <id>${BASE}/guides/</id>
  <updated>${(published[0]?.updated || published[0]?.publish || TODAY)}T00:00:00Z</updated>
${published.map((g) => `  <entry><title>${esc(g.title)}</title><link href="${BASE}/guides/${g.slug}/"/><id>${BASE}/guides/${g.slug}/</id><updated>${g.updated || g.publish}T00:00:00Z</updated><summary>${esc(g.description)}</summary></entry>`).join("\n")}
</feed>
`);
let commit = process.env.GITHUB_SHA || "";
try { commit ||= execSync("git rev-parse HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a git checkout */ }
fs.writeFileSync(path.join(OUT, "build.json"), JSON.stringify({ built: new Date().toISOString(), date: TODAY, commit, guides: published.length, scheduled: guideList.length - published.length, holes: holes.length, unavailable: [...unavailable], availabilityChecked: avail.checked || null, base: BASE }, null, 1) + "\n");
fs.writeFileSync(path.resolve(ROOT, process.env.URLS_OUT || "dist-urls.txt"), urls.join("\n") + "\n");
console.log(`built ${pages.length} pages into ${path.relative(ROOT, OUT)} for ${BASE} (${holes.length} demo paths, ${published.length} guides live, ${guideList.length - published.length} scheduled, ${unavailable.size} videos marked unavailable)`);
