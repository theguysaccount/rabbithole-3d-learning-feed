// A rabbit hole: a main track of YouTube clips, where any clip can have a "deeper" track of its
// own. Pure functions (no DOM), shared by the player, the editor, the build and the tests.
//
//   { v: 1, title, about, track: [ { id, yt, start?, end?, title, note?, deeper?: [ ...clips ] } ] }
//
// Moving around: down = next clip on this track, up = previous, right = go deeper (the first clip
// of this clip's deeper track), left = back out (to the clip this track hangs from).

export const LIMITS = { clips: 200, depth: 6, title: 120, note: 300, holeTitle: 100, about: 400 };
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** "90", "90s", "1:30", "1m30s", "1h2m3s" → seconds (or null). */
export function parseTime(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  const s = String(v).trim().toLowerCase();
  if (/^\d+(\.\d+)?s?$/.test(s)) return parseFloat(s);
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(s)) return s.split(":").reduce((a, b) => a * 60 + parseFloat(b), 0);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(s);
  if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  return null;
}

/** Seconds → "1:05" or "1:02:03". */
export function formatTime(t) {
  if (t === null || t === undefined || !Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round(t));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * A YouTube link (watch, youtu.be, shorts, embed, live, nocookie) or a bare video id → {yt, start}.
 * Returns null for anything else.
 */
export function parseYouTube(input) {
  const raw = String(input || "").trim();
  if (YT_ID.test(raw)) return { yt: raw, start: null };
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname);
      if (m) id = m[1];
    }
  }
  if (!id || !YT_ID.test(id)) return null;
  const t = u.searchParams.get("t") ?? u.searchParams.get("start") ?? (/(?:^|&)t=([^&]+)/.exec(u.hash.slice(1))?.[1] ?? null);
  return { yt: id, start: parseTime(t) };
}

export const watchUrl = (clip) => `https://www.youtube.com/watch?v=${clip.yt}${clip.start ? `&t=${Math.floor(clip.start)}s` : ""}`;
export const thumbUrl = (yt) => `https://i.ytimg.com/vi/${yt}/mqdefault.jpg`;

/** Clean and check a hole. Returns {hole, errors}; the hole is always safe to render. */
export function sanitize(input) {
  const errors = [];
  const used = new Set();
  let count = 0;
  const str = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  const newId = () => { let i = used.size; let id; do { id = (i++).toString(36); } while (used.has(id)); return id; };
  function track(list, depth) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const c of list) {
      if (count >= LIMITS.clips) { errors.push(`Only the first ${LIMITS.clips} clips are kept.`); break; }
      if (!c || typeof c !== "object" || !YT_ID.test(String(c.yt || ""))) { errors.push("A clip without a valid YouTube video was skipped."); continue; }
      count++;
      let id = /^[A-Za-z0-9_-]{1,16}$/.test(String(c.id || "")) && !used.has(c.id) ? String(c.id) : newId();
      used.add(id);
      const start = parseTime(c.start), end = parseTime(c.end);
      const clip = { id, yt: c.yt, title: str(c.title, LIMITS.title) || "YouTube video" };
      if (start !== null && start > 0) clip.start = Math.floor(start);
      if (end !== null && end > (clip.start || 0)) clip.end = Math.ceil(end);
      else if (end !== null) errors.push(`"${clip.title}": the end time is before the start, so it was dropped.`);
      const note = str(c.note, LIMITS.note);
      if (note) clip.note = note;
      if (Array.isArray(c.deeper) && c.deeper.length) {
        if (depth >= LIMITS.depth) errors.push(`Tracks more than ${LIMITS.depth} levels deep were cut off.`);
        else { const d = track(c.deeper, depth + 1); if (d.length) clip.deeper = d; }
      }
      out.push(clip);
    }
    return out;
  }
  const src = input && typeof input === "object" ? input : {};
  const hole = { v: 1, title: str(src.title, LIMITS.holeTitle) || "Untitled rabbit hole", about: str(src.about, LIMITS.about), track: track(src.track, 1) };
  if (!hole.about) delete hole.about;
  return { hole, errors: [...new Set(errors)] };
}

/** Where every clip sits: id → {clip, track, index, parent (clip or null), depth}. */
export function indexHole(hole) {
  const map = new Map();
  (function walk(track, parent, depth) {
    track.forEach((clip, index) => {
      map.set(clip.id, { clip, track, index, parent, depth });
      if (clip.deeper) walk(clip.deeper, clip, depth + 1);
    });
  })(hole.track, null, 0);
  return map;
}

export function navigator(hole) {
  const idx = indexHole(hole);
  const at = (id) => idx.get(id);
  const first = hole.track[0]?.id ?? null;
  return {
    first, at, size: idx.size,
    next: (id) => { const p = at(id); return p?.track[p.index + 1]?.id ?? null; },
    prev: (id) => { const p = at(id); return p && p.index > 0 ? p.track[p.index - 1].id : null; },
    deeper: (id) => at(id)?.clip.deeper?.[0]?.id ?? null,
    out: (id) => at(id)?.parent?.id ?? null,
    /** What plays after this clip ends: the next clip on this track, or else the clip after the one this track hangs from. */
    after(id) {
      let p = at(id);
      while (p) {
        const n = p.track[p.index + 1];
        if (n) return n.id;
        p = p.parent ? at(p.parent.id) : null;
      }
      return null;
    },
    /** The clips from the main track down to this one. */
    trail(id) {
      const out = [];
      for (let p = at(id); p; p = p.parent ? at(p.parent.id) : null) out.unshift(p.clip);
      return out;
    },
    /** Every clip, depth first: a clip, then its deeper track, then the next clip. */
    tour() {
      const out = [];
      (function walk(t) { for (const c of t) { out.push(c.id); if (c.deeper) walk(c.deeper); } })(hole.track);
      return out;
    },
  };
}

// ---------- sharing: the whole hole travels in the link ----------
const b64url = (bytes) => {
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Hole → compact text for a URL fragment ("1z." deflate, or "1j." plain where compression isn't available). */
export async function encodeHole(hole) {
  const json = new TextEncoder().encode(JSON.stringify(sanitize(hole).hole));
  if (typeof CompressionStream !== "undefined") {
    try { return "1z." + b64url(await pipe(json, new CompressionStream("deflate-raw"))); } catch { /* fall through */ }
  }
  return "1j." + b64url(json);
}

/** Inverse of encodeHole. Throws a readable error for damaged links. */
export async function decodeHole(text) {
  const m = /^1([zj])\.([A-Za-z0-9_-]+)$/.exec(String(text || "").trim());
  if (!m) throw new Error("This link doesn't contain a rabbit hole. It may have been cut short when it was copied.");
  let bytes;
  try { bytes = unb64url(m[2]); } catch { throw new Error("This link is damaged: part of it is missing or changed."); }
  if (m[1] === "z") {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser is too old to open this link. Try a recent Chrome, Edge, Safari or Firefox.");
    try { bytes = await pipe(bytes, new DecompressionStream("deflate-raw")); } catch { throw new Error("This link is damaged: part of it is missing or changed."); }
  }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("This link is damaged: part of it is missing or changed."); }
  return sanitize(data);
}

/** Read #h=…&at=… from a URL hash. */
export function readHash(hash) {
  const p = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  return { h: p.get("h"), at: p.get("at"), t: parseTime(p.get("t")) };
}

/** How many clips, and how deep the deepest track goes. */
export function stats(hole) {
  let clips = 0, depth = 0, timed = 0, seconds = 0;
  (function walk(t, d) { for (const c of t) { clips++; depth = Math.max(depth, d); if (c.end) { timed++; seconds += c.end - (c.start || 0); } if (c.deeper) walk(c.deeper, d + 1); } })(hole.track, 1);
  return { clips, depth, timed, seconds };
}

// ---------- editing (used by the builder; each returns a new hole) ----------
const clone = (h) => JSON.parse(JSON.stringify(h));

export function newClipId(hole) {
  const ids = indexHole(hole);
  let n = ids.size;
  while (ids.has(n.toString(36))) n++;
  return n.toString(36);
}

/** Add a clip at the end of a track: the main track (parentId null) or a clip's deeper track. */
export function addClip(hole, clip, parentId = null) {
  const h = clone(hole);
  const c = { ...clip, id: clip.id || newClipId(h) };
  if (parentId === null) h.track.push(c);
  else {
    const p = indexHole(h).get(parentId);
    if (!p) throw new Error("That clip no longer exists.");
    (p.clip.deeper ||= []).push(c);
  }
  return { hole: h, id: c.id };
}

export function updateClip(hole, id, patch) {
  const h = clone(hole);
  const p = indexHole(h).get(id);
  if (!p) return h;
  Object.assign(p.clip, patch);
  for (const k of ["start", "end", "note"]) if (p.clip[k] === null || p.clip[k] === "") delete p.clip[k];
  return h;
}

export function removeClip(hole, id) {
  const h = clone(hole);
  const p = indexHole(h).get(id);
  if (!p) return h;
  p.track.splice(p.index, 1);
  if (p.parent && !p.parent.deeper.length) delete p.parent.deeper;
  return h;
}

/** Move a clip up (-1) or down (+1) within its track. */
export function moveClip(hole, id, dir) {
  const h = clone(hole);
  const p = indexHole(h).get(id);
  if (!p) return h;
  const j = p.index + dir;
  if (j < 0 || j >= p.track.length) return h;
  [p.track[p.index], p.track[j]] = [p.track[j], p.track[p.index]];
  return h;
}

/** Make a clip part of the deeper track of the clip above it (like Tab in an outline). */
export function indent(hole, id) {
  const h = clone(hole);
  const p = indexHole(h).get(id);
  if (!p || p.index === 0 || p.depth + 1 >= LIMITS.depth) return h;
  const above = p.track[p.index - 1];
  p.track.splice(p.index, 1);
  (above.deeper ||= []).push(p.clip);
  return h;
}

/** Move a clip out of its deeper track, to just after the clip that track hangs from (Shift+Tab). */
export function outdent(hole, id) {
  const h = clone(hole);
  const idx = indexHole(h);
  const p = idx.get(id);
  if (!p || !p.parent) return h;
  const pp = idx.get(p.parent.id);
  p.track.splice(p.index, 1);
  if (!p.parent.deeper.length) delete p.parent.deeper;
  pp.track.splice(pp.index + 1, 0, p.clip);
  return h;
}

/** Is `id` inside the deeper tracks of `ancestorId` (or the same clip)? */
export function within(hole, id, ancestorId) {
  const nav = navigator(hole);
  return nav.trail(id).some((c) => c.id === ancestorId);
}

/** Drag and drop: move a clip before or after another clip, or to the end of its deeper track. */
export function moveTo(hole, id, targetId, where = "after") {
  if (id === targetId || within(hole, targetId, id)) return hole;   // never into itself
  const h = clone(hole);
  const idx = indexHole(h);
  const p = idx.get(id);
  if (!p || !idx.get(targetId)) return hole;
  p.track.splice(p.index, 1);
  if (p.parent && !p.parent.deeper.length) delete p.parent.deeper;
  const t = indexHole(h).get(targetId);
  if (where === "inside") {
    if (t.depth + 1 >= LIMITS.depth) return hole;
    (t.clip.deeper ||= []).push(p.clip);
  } else t.track.splice(t.index + (where === "after" ? 1 : 0), 0, p.clip);
  return h;
}
