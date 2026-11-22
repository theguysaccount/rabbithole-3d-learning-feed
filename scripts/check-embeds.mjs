// Check that every video in the demo paths can still be embedded, using YouTube's public oEmbed
// endpoint (200 = public and embeddable, 401 = embedding switched off, 404 = removed or private),
// and record the result in data/availability.json. The build marks unplayable videos and the
// player skips them, so a demo path keeps working when a creator removes a video.
//   node scripts/check-embeds.mjs [--now <ISO time>]
// Exit code 0 always, unless --strict: a network failure keeps the last known result for that
// video (marked with the time it was last confirmed), so a bad network day never breaks the site.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "data/availability.json");
const args = process.argv.slice(2);
const now = (args.includes("--now") ? new Date(args[args.indexOf("--now") + 1]) : new Date()).toISOString();
const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { videos: {} };

const ids = new Set();
for (const f of fs.readdirSync(path.join(ROOT, "site/holes")).filter((f) => f.endsWith(".json"))) {
  (function walk(t) { for (const c of t) { ids.add(c.yt); if (c.deeper) walk(c.deeper); } })(JSON.parse(fs.readFileSync(path.join(ROOT, "site/holes", f), "utf8")).track);
}

const out = { checked: now, note: "Written by scripts/check-embeds.mjs from YouTube's oEmbed endpoint. ok:false means the video can't be played in an embedded player any more.", videos: {} };
const changes = [];
let failures = 0;
for (const id of [...ids].sort()) {
  const was = old.videos?.[id];
  let rec = null;
  for (let attempt = 0; attempt < 3 && !rec; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * attempt));
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { headers: { "User-Agent": "rabbithole-embed-check (+https://github.com/theguysaccount/rabbithole-3d-learning-feed)" }, signal: AbortSignal.timeout(15000) });
      if (res.ok) { const j = await res.json(); rec = { ok: true, status: 200, title: j.title, author: j.author_name, confirmed: now }; }
      else if ([401, 403, 404].includes(res.status)) rec = { ok: false, status: res.status, confirmed: now };
      // 429 and 5xx: try again, then keep what we knew
    } catch { /* network: try again */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!rec) { failures++; rec = was ? { ...was, stale: true } : { ok: null, status: 0, confirmed: null }; console.log(`?? ${id}: couldn't check; keeping the last result`); }
  else delete rec.stale;
  if (was && was.ok !== rec.ok && rec.ok !== null) changes.push(`${id}: ${was.ok ? "playable" : "unplayable"} -> ${rec.ok ? "playable" : `unplayable (HTTP ${rec.status})`}`);
  if (!was && rec.ok === false) changes.push(`${id}: unplayable (HTTP ${rec.status})`);
  out.videos[id] = rec;
}
fs.mkdirSync(path.dirname(FILE), { recursive: true });
fs.writeFileSync(FILE, JSON.stringify(out, null, 1) + "\n");
const bad = Object.entries(out.videos).filter(([, v]) => v.ok === false).map(([id]) => id);
console.log(`checked ${ids.size} videos: ${ids.size - bad.length - failures} playable, ${bad.length} unplayable, ${failures} not reachable`);
for (const c of changes) console.log(`CHANGED ${c}`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changes.length ? "true" : "false"}\nunplayable=${bad.join(" ")}\nunreachable=${failures}\n`);
}
if (args.includes("--strict") && failures) process.exit(1);
