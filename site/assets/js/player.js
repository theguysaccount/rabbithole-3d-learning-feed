// The rabbit-hole player. Videos play in YouTube's own embedded player (privacy-enhanced mode),
// which is never covered, restyled or modified; this code only decides which clip plays next.
// Navigation: buttons, arrow keys, and swipes on the pad below the video (not on the video itself,
// so YouTube's controls stay fully usable).
import { navigator, watchUrl, thumbUrl, formatTime, encodeHole, stats } from "./hole.js";
import { track } from "./track.js";

let apiPromise = null;
/** Load YouTube's IFrame Player API once. */
export function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("YouTube's player is taking too long to load. Check your connection, or whether a content blocker is stopping youtube.com.")), 20000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); try { prev?.(); } catch { /* not ours */ } resolve(window.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => { clearTimeout(timer); reject(new Error("YouTube's player couldn't load. Check your connection, or whether a content blocker is stopping youtube.com.")); };
    document.head.append(s);
  }).catch((e) => { apiPromise = null; throw e; });
  return apiPromise;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Mount a player.
 * @param {HTMLElement} root
 * @param {object} hole  a sanitized hole
 * @param {{at?: string, shareBase?: string, buildUrl?: string, embed?: boolean, slug?: string, autoplay?: boolean, onMove?: (id:string)=>void, unavailable?: Set<string>}} opts
 */
export function mountPlayer(root, hole, opts = {}) {
  const nav = navigator(hole);
  const unavailable = opts.unavailable || new Set();
  let current = nav.at(opts.at) ? opts.at : nav.first;
  const visited = new Set(current ? [current] : []);
  const path = current ? [current] : [];
  let yt = null, ytReady = false, autoplay = opts.autoplay ?? true, skipTimer = 0;
  const s = stats(hole);
  const uid = Math.random().toString(36).slice(2, 8);

  root.classList.add("rh");
  root.innerHTML = `
    <div class="rh-head">
      <div>
        <p class="rh-kicker">${opts.embed ? `<a href="${esc(opts.shareBase || "../")}" target="_blank" rel="noopener">Rabbit Hole</a> · ` : ""}${s.clips} clip${s.clips === 1 ? "" : "s"}, ${s.depth} level${s.depth === 1 ? "" : "s"} deep</p>
        <h2 class="rh-hole-title">${esc(hole.title)}</h2>
      </div>
      <label class="rh-auto"><input type="checkbox" ${autoplay ? "checked" : ""}> Autoplay next</label>
    </div>
    <nav class="rh-crumbs" aria-label="Where you are in the rabbit hole"></nav>
    <div class="rh-stage">
      <div class="rh-video"><div id="rh-yt-${uid}"></div></div>
      <div class="rh-blocked" hidden role="alert"><p class="rh-blocked-text"></p><p><a class="btn" target="_blank" rel="noopener">Watch on YouTube</a> <button class="btn ghost" type="button" data-go="after">Skip</button></p></div>
    </div>
    <div class="rh-pad" tabindex="0" aria-label="Swipe pad. Swipe up for the next clip, down for the previous one, left to go deeper, right to back out. Arrow keys work too.">
      <div class="rh-card">
        <p class="rh-pos"></p>
        <h3 class="rh-title"></h3>
        <p class="rh-note"></p>
      </div>
      <div class="rh-nav">
        <button class="rh-btn" type="button" data-go="prev" aria-keyshortcuts="ArrowUp"><span aria-hidden="true">↑</span> Previous</button>
        <button class="rh-btn" type="button" data-go="out" aria-keyshortcuts="ArrowLeft"><span aria-hidden="true">←</span> Back out</button>
        <button class="rh-btn deeper" type="button" data-go="deeper" aria-keyshortcuts="ArrowRight">Go deeper <span aria-hidden="true">→</span></button>
        <button class="rh-btn next" type="button" data-go="next" aria-keyshortcuts="ArrowDown">Next <span aria-hidden="true">↓</span></button>
      </div>
      <p class="rh-hint">Swipe here, or use the arrow keys: <b>↓</b> next · <b>→</b> go deeper · <b>←</b> back out</p>
    </div>
    <details class="rh-map-wrap" open>
      <summary>Map of this rabbit hole <span class="rh-progress"></span></summary>
      <div class="rh-map"></div>
    </details>
    <div class="rh-share">
      <button class="btn" type="button" data-share="hole">Share this rabbit hole</button>
      <button class="btn ghost" type="button" data-share="here">Share where I am</button>
      ${opts.embed ? "" : `<button class="btn ghost" type="button" data-share="embed">Embed</button>`}
      ${opts.buildUrl ? `<a class="btn ghost" data-remix href="${esc(opts.buildUrl)}">Remix it</a>` : ""}
      <span class="rh-share-msg" role="status" aria-live="polite"></span>
    </div>
    <div class="rh-embed" hidden><label>Paste this into your site's HTML:<textarea readonly rows="3"></textarea></label></div>`;

  const $ = (sel) => root.querySelector(sel);
  const el = {
    crumbs: $(".rh-crumbs"), pos: $(".rh-pos"), title: $(".rh-title"), note: $(".rh-note"), card: $(".rh-card"),
    blocked: $(".rh-blocked"), blockedText: $(".rh-blocked-text"), blockedLink: $(".rh-blocked a"), map: $(".rh-map"),
    progress: $(".rh-progress"), pad: $(".rh-pad"), msg: $(".rh-share-msg"), embed: $(".rh-embed"), auto: $(".rh-auto input"),
  };

  // ---------- YouTube ----------
  function clipArgs(c) {
    const a = { videoId: c.yt };
    if (c.start) a.startSeconds = c.start;
    if (c.end) a.endSeconds = c.end;
    return a;
  }

  loadYouTube().then((YT) => {
    const c = nav.at(current)?.clip;
    yt = new YT.Player(`rh-yt-${uid}`, {
      host: "https://www.youtube-nocookie.com",
      videoId: c?.yt,
      width: "100%", height: "100%",
      playerVars: { playsinline: 1, rel: 0, ...(c?.start ? { start: c.start } : {}), ...(c?.end ? { end: c.end } : {}), origin: location.origin },
      events: {
        onReady: () => { ytReady = true; root.dataset.yt = "ready"; },
        onStateChange: (e) => {
          root.dataset.state = String(e.data);
          if (e.data === YT.PlayerState.PLAYING) clearBlocked();
          if (e.data === YT.PlayerState.ENDED && autoplay) { const n = nav.after(current); if (n) go(n, "auto"); }
        },
        onError: (e) => showBlocked(e.data),
      },
    });
    root.dataset.yt = "loading";
  }).catch((e) => {
    root.dataset.yt = "failed";
    el.blocked.hidden = false;
    el.blockedText.textContent = e.message;
    el.blockedLink.href = watchUrl(nav.at(current).clip);
  });

  function play(id, how) {
    const c = nav.at(id).clip;
    if (!yt || !ytReady) return;                     // the first clip is set when the player is created
    clearBlocked();
    if (unavailable.has(c.yt)) { showBlocked(150); return; }
    if (how === "jump" || how === "auto" || how === "nav") yt.loadVideoById(clipArgs(c));
    else yt.cueVideoById(clipArgs(c));
  }

  function showBlocked(code) {
    const c = nav.at(current).clip;
    el.blocked.hidden = false;
    el.blockedText.textContent = code === 101 || code === 150 || code === 152
      ? "The owner of this video doesn't allow it to be played on other websites."
      : code === 100 ? "This video is no longer available on YouTube (removed or made private)."
      : "YouTube couldn't play this video here.";
    el.blockedLink.href = watchUrl(c);
    root.dataset.blocked = String(code);
    clearTimeout(skipTimer);
    if (autoplay && nav.after(current)) skipTimer = setTimeout(() => go(nav.after(current), "auto"), 5000);
  }
  function clearBlocked() { el.blocked.hidden = true; clearTimeout(skipTimer); delete root.dataset.blocked; }

  // ---------- moving around ----------
  function go(id, how = "nav") {
    if (!id || !nav.at(id)) return;
    const dir = how === "auto" ? "next" : how;
    const from = nav.at(current), to = nav.at(id);
    current = id;
    visited.add(id);
    if (path.at(-1) !== id) path.push(id);
    render(dir === "nav" ? (to.depth > from.depth ? "deeper" : to.depth < from.depth ? "out" : to.index > from.index ? "next" : "prev") : dir);
    play(id, how === "auto" ? "auto" : "nav");
    opts.onMove?.(id);
    track(to.depth > from.depth ? "go_deeper" : "clip_view");
  }

  function act(what) {
    const target = { next: nav.next(current), prev: nav.prev(current), deeper: nav.deeper(current), out: nav.out(current), after: nav.after(current) }[what];
    if (target) go(target, "nav");
    else bump(what);
  }

  function bump(what) {
    el.card.classList.remove("bump");
    void el.card.offsetWidth;
    el.card.classList.add("bump");
    el.card.dataset.bump = what;
  }

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (b && !b.disabled) act(b.dataset.go);
    const m = e.target.closest("[data-clip]");
    if (m) { e.preventDefault(); go(m.dataset.clip, "nav"); }
    const sh = e.target.closest("[data-share]");
    if (sh) share(sh.dataset.share);
  });
  el.auto.addEventListener("change", () => { autoplay = el.auto.checked; });

  root.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select") || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = { ArrowDown: "next", ArrowUp: "prev", ArrowRight: "deeper", ArrowLeft: "out" }[e.key];
    if (k) { e.preventDefault(); act(k); }
  });
  // Arrow keys also work when nothing in particular has focus (the page itself).
  const onDocKey = (e) => {
    if (document.activeElement && document.activeElement !== document.body) return;
    const k = { ArrowDown: "next", ArrowUp: "prev", ArrowRight: "deeper", ArrowLeft: "out" }[e.key];
    if (k && root.isConnected) { e.preventDefault(); act(k); }
  };
  document.addEventListener("keydown", onDocKey);

  // Swipes on the pad: up = next, down = previous, left = deeper, right = back out.
  let sx = 0, sy = 0, st = 0, pid = null;
  el.pad.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; pid = e.pointerId; sx = e.clientX; sy = e.clientY; st = performance.now(); });
  el.pad.addEventListener("pointerup", (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    const dx = e.clientX - sx, dy = e.clientY - sy, fast = performance.now() - st < 800;
    if (!fast || Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
    if (Math.abs(dy) > Math.abs(dx)) act(dy < 0 ? "next" : "prev");
    else act(dx < 0 ? "deeper" : "out");
  });
  el.pad.addEventListener("pointercancel", () => { pid = null; });

  // ---------- drawing ----------
  function render(dir = "") {
    const p = nav.at(current);
    if (!p) return;
    const c = p.clip;
    const trail = nav.trail(current);
    el.crumbs.innerHTML = `<a href="#" data-clip="${esc(nav.first)}">Main track</a>` + trail.slice(0, -1).map((x) => ` <span aria-hidden="true">›</span> <a href="#" data-clip="${esc(x.id)}">${esc(x.title)}</a>`).join("") + ` <span aria-hidden="true">›</span> <span aria-current="location">${esc(c.title)}</span>`;
    const where = p.depth === 0 ? "Main track" : `${p.depth} level${p.depth > 1 ? "s" : ""} deep`;
    el.pos.textContent = `${where} · clip ${p.index + 1} of ${p.track.length}${c.start || c.end ? ` · ${formatTime(c.start || 0)}–${c.end ? formatTime(c.end) : "end"}` : ""}`;
    el.title.textContent = c.title;
    el.note.textContent = c.note || "";
    el.note.hidden = !c.note;
    const can = { next: nav.next(current), prev: nav.prev(current), deeper: nav.deeper(current), out: nav.out(current) };
    for (const b of root.querySelectorAll(".rh-nav [data-go]")) {
      const t = can[b.dataset.go];
      b.disabled = !t;
      b.title = t ? nav.at(t).clip.title : { next: "End of this track", prev: "Start of this track", deeper: "Nothing deeper here", out: "You're on the main track" }[b.dataset.go];
    }
    const deeperBtn = root.querySelector('[data-go="deeper"]');
    deeperBtn.innerHTML = `Go deeper${c.deeper ? ` <small>(${c.deeper.length})</small>` : ""} <span aria-hidden="true">→</span>`;
    el.pad.classList.toggle("has-deeper", !!c.deeper);
    if (dir) { el.card.dataset.dir = dir; el.card.classList.remove("enter"); void el.card.offsetWidth; el.card.classList.add("enter"); }
    renderMap();
    el.progress.textContent = `· ${visited.size} of ${nav.size} watched`;
    root.dataset.current = current;
  }

  function renderMap() {
    const item = (c) => `<li class="${c.id === current ? "now" : ""}${visited.has(c.id) ? " seen" : ""}${unavailable.has(c.yt) ? " gone" : ""}">
      <a href="#" data-clip="${esc(c.id)}"${c.id === current ? ' aria-current="true"' : ""}><img src="${thumbUrl(c.yt)}" alt="" loading="lazy" width="80" height="45"><span>${esc(c.title)}</span></a>
      ${c.deeper ? `<ol class="rh-deeper" aria-label="Deeper: ${esc(c.title)}">${c.deeper.map(item).join("")}</ol>` : ""}</li>`;
    el.map.innerHTML = `<ol class="rh-main" aria-label="Main track">${hole.track.map(item).join("")}</ol>`;
  }

  // ---------- sharing ----------
  async function share(what) {
    const base = opts.shareBase || location.href.split("#")[0];
    let url;
    if (opts.slug) url = `${base}${what === "here" ? `#at=${encodeURIComponent(current)}` : ""}`;
    else {
      const h = await encodeHole(hole);
      url = `${base}#h=${h}${what === "here" ? `&at=${encodeURIComponent(current)}` : ""}`;
    }
    if (what === "embed") {
      const src = opts.embedUrl ? await opts.embedUrl(current) : url;
      el.embed.hidden = false;
      const ta = el.embed.querySelector("textarea");
      ta.value = `<iframe src="${src}" title="${esc(hole.title)}" width="560" height="900" style="max-width:100%;border:0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`;
      ta.focus(); ta.select();
      track("embed_copied");
      return;
    }
    track("hole_shared");
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title: hole.title, text: hole.about || "A rabbit hole of videos to explore", url });
      else { await navigator.clipboard.writeText(url); say("Link copied"); }
    } catch {
      say("Copy this link:");
      el.embed.hidden = false;
      el.embed.querySelector("textarea").value = url;
    }
  }
  function say(t) { el.msg.textContent = t; setTimeout(() => { el.msg.textContent = ""; }, 2500); }

  render();
  return {
    go, act, get current() { return current; }, get path() { return [...path]; }, visited,
    destroy() { document.removeEventListener("keydown", onDocKey); try { yt?.destroy(); } catch { /* gone */ } root.innerHTML = ""; },
  };
}
