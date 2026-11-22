// The rabbit-hole builder. Paste YouTube links, arrange them into a main track with deeper side
// tracks (buttons, keyboard or drag and drop), preview, and share one link that holds everything.
// Drafts are kept in this browser only (localStorage). Video titles come from YouTube's public
// oEmbed endpoint, which also tells us whether a video may be embedded.
import { sanitize, parseYouTube, parseTime, formatTime, thumbUrl, watchUrl, encodeHole, decodeHole, readHash, stats,
  addClip, updateClip, removeClip, moveClip, indent, outdent, moveTo, newClipId, LIMITS } from "./hole.js";
import { mountPlayer } from "./player.js";
import { track } from "./track.js";

const KEY = "rabbithole:draft:v1";
const $ = (id) => document.getElementById(id);
const root = $("builder");
if (root) init();

function init() {
  const el = {
    title: $("b-title"), about: $("b-about"), add: $("b-add"), url: $("b-url"), target: $("b-target"), targetName: $("b-target-name"),
    cancelTarget: $("b-target-cancel"), error: $("b-error"), tree: $("b-tree"), empty: $("b-empty"), link: $("b-link"),
    copy: $("b-copy"), open: $("b-open"), embed: $("b-embed"), embedBox: $("b-embed-box"), download: $("b-download"),
    importBtn: $("b-import"), importFile: $("b-import-file"), msg: $("b-msg"), preview: $("player"), stats: $("b-stats"),
    undo: $("b-undo"), clear: $("b-clear"), starts: document.querySelectorAll("[data-start]"), size: $("b-size"),
  };
  let hole = { v: 1, title: "", about: "", track: [] };
  let target = null;           // clip id whose deeper track receives the next added video, or null for the main track
  let player = null, undoStack = [], shareUrl = "";
  const titles = new Map();    // yt id -> {title, author, embeddable}

  // ---------- load: a shared link, a demo to remix, or the saved draft ----------
  (async () => {
    await null;                // let init() finish declaring everything before the first render
    const { h } = readHash(location.hash);
    const from = new URLSearchParams(location.search).get("from");
    try {
      if (h) { const r = await decodeHole(h); hole = r.hole; say(r.errors.join(" ") || "Loaded the rabbit hole from the link. Change anything, then share your own version."); }
      else if (from && /^[a-z0-9-]{1,60}$/.test(from)) { hole = sanitize(await (await fetch(new URL(`../holes/${from}.json`, location.href))).json()).hole; hole.title = `${hole.title} (remix)`; say("Loaded the demo. Make it your own, then share it."); }
      else { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) { hole = sanitize(saved).hole; if (hole.title === "Untitled rabbit hole") hole.title = ""; } }
    } catch (e) { say(e.message, true); }
    if (h || from) window.history.replaceState(null, "", location.pathname);
    render();
  })();

  function commit(next, { remember = true } = {}) {
    if (remember) { undoStack.push(JSON.stringify(hole)); if (undoStack.length > 50) undoStack.shift(); }
    hole = next;
    try { localStorage.setItem(KEY, JSON.stringify(hole)); } catch { /* private mode: the draft lives in the page only */ }
    render();
  }

  // ---------- adding videos ----------
  el.add.addEventListener("submit", async (e) => {
    e.preventDefault();
    el.error.textContent = "";
    const parsed = parseYouTube(el.url.value);
    if (!parsed) { el.error.textContent = "That isn't a YouTube video link. Paste a link like youtube.com/watch?v=…, youtu.be/… or youtube.com/shorts/…"; return; }
    if (countClips() >= LIMITS.clips) { el.error.textContent = `A rabbit hole can hold up to ${LIMITS.clips} clips.`; return; }
    const btn = el.add.querySelector("button[type=submit]");
    btn.disabled = true;
    const info = await lookup(parsed.yt);
    btn.disabled = false;
    if (info.embeddable === false) {
      el.error.textContent = info.status === 401
        ? "The owner of this video doesn't allow it to be played on other websites, so it can't go in a rabbit hole."
        : "YouTube says this video doesn't exist or is private.";
      return;
    }
    const clip = { yt: parsed.yt, title: info.title || "YouTube video" };
    if (parsed.start) clip.start = Math.floor(parsed.start);
    const r = addClip(hole, clip, target);
    commit(r.hole);
    el.url.value = "";
    say(`Added “${clip.title}”${target ? " to the deeper track" : ""}.`);
    track("clip_added");
    focusClip(r.id);
  });

  async function lookup(yt) {
    if (titles.has(yt)) return titles.get(yt);
    let info = { title: "", author: "", embeddable: null };
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${yt}`)}`, { credentials: "omit" });
      if (res.ok) { const j = await res.json(); info = { title: String(j.title || "").slice(0, LIMITS.title), author: j.author_name || "", embeddable: true }; }
      else if (res.status === 401 || res.status === 403 || res.status === 404) info = { title: "", author: "", embeddable: false, status: res.status };
    } catch { /* offline or blocked: add it anyway; the player shows a message if it can't play */ }
    titles.set(yt, info);
    return info;
  }

  el.cancelTarget.addEventListener("click", () => setTarget(null));
  function setTarget(id) {
    target = id;
    const c = id && findClip(id);
    el.target.hidden = !c;
    el.targetName.textContent = c ? c.title : "";
    el.url.placeholder = c ? "Paste a YouTube link to add to the deeper track" : "Paste a YouTube link (watch, youtu.be or shorts)";
    if (c) el.url.focus();
  }

  // ---------- title and description ----------
  el.title.addEventListener("input", () => commit({ ...hole, title: el.title.value }, { remember: false }));
  el.about.addEventListener("input", () => commit({ ...hole, about: el.about.value }, { remember: false }));

  // ---------- the outline ----------
  el.tree.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    const act = b.dataset.act;
    if (act === "deeper") { setTarget(id); return; }
    if (act === "play") { player?.go(id, "nav"); el.preview.scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
    const next = { up: () => moveClip(hole, id, -1), down: () => moveClip(hole, id, 1), indent: () => indent(hole, id), outdent: () => outdent(hole, id), remove: () => removeClip(hole, id) }[act]?.();
    if (next) {
      if (act === "remove" && target === id) setTarget(null);
      commit(next);
      if (act !== "remove") focusClip(id, act);
    }
  });
  el.tree.addEventListener("change", (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const id = row.dataset.id;
    const f = e.target.dataset.field;
    if (f === "title") commit(updateClip(hole, id, { title: e.target.value.trim().slice(0, LIMITS.title) || "YouTube video" }));
    if (f === "note") commit(updateClip(hole, id, { note: e.target.value.trim().slice(0, LIMITS.note) }));
    if (f === "start" || f === "end") {
      const v = e.target.value.trim(), t = v ? parseTime(v) : null;
      if (v && t === null) { e.target.setCustomValidity("Use minutes:seconds, like 1:30"); e.target.reportValidity(); return; }
      e.target.setCustomValidity("");
      commit(sanitize(updateClip(hole, id, { [f]: t })).hole);
    }
  });
  // Keyboard: Alt+↑/↓ move, Tab/Shift+Tab on the move handle indent and outdent.
  el.tree.addEventListener("keydown", (e) => {
    const handle = e.target.closest(".b-handle");
    if (!handle) return;
    const id = handle.closest("[data-id]").dataset.id;
    const act = e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : e.key === "Tab" ? (e.shiftKey ? "outdent" : "indent") : null;
    if (!act) return;
    e.preventDefault();
    const next = { up: () => moveClip(hole, id, -1), down: () => moveClip(hole, id, 1), indent: () => indent(hole, id), outdent: () => outdent(hole, id) }[act]();
    commit(next);
    focusClip(id, "handle");
  });

  // Drag and drop (mouse, pen and touch): drag a clip by its handle onto another clip. The top
  // third drops before it, the bottom third after it, the middle drops it into its deeper track.
  let drag = null;
  el.tree.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".b-handle");
    if (!handle) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    drag = { id: handle.closest("[data-id]").dataset.id, handle, over: null, where: null };
    root.classList.add("dragging");
  });
  el.tree.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest(".b-clip");
    clearDrop();
    if (!hit) return;
    const id = hit.closest("[data-id]").dataset.id;
    if (id === drag.id) return;
    const r = hit.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    drag.over = id;
    drag.where = y < 0.3 ? "before" : y > 0.7 ? "after" : "inside";
    hit.classList.add(`drop-${drag.where}`);
  });
  const endDrag = () => {
    if (!drag) return;
    const { id, over, where } = drag;
    drag = null;
    root.classList.remove("dragging");
    clearDrop();
    if (over && where) {
      const next = moveTo(hole, id, over, where);
      if (next !== hole) { commit(next); focusClip(id, "handle"); say(where === "inside" ? "Moved into the deeper track." : "Moved."); }
    }
  };
  el.tree.addEventListener("pointerup", endDrag);
  el.tree.addEventListener("pointercancel", endDrag);
  function clearDrop() { for (const x of el.tree.querySelectorAll(".drop-before, .drop-after, .drop-inside")) x.classList.remove("drop-before", "drop-after", "drop-inside"); }

  el.undo.addEventListener("click", () => {
    const last = undoStack.pop();
    if (last) { hole = JSON.parse(last); try { localStorage.setItem(KEY, last); } catch { /* ignore */ } render(); say("Undone."); }
  });
  el.clear.addEventListener("click", () => {
    if (!countClips() && !hole.title) return;
    if (!confirm("Start a new, empty rabbit hole? The current one stays in your undo history until you leave this page.")) return;
    commit({ v: 1, title: "", about: "", track: [] });
    setTarget(null);
  });
  for (const b of el.starts) b.addEventListener("click", async () => {
    try {
      const h = sanitize(await (await fetch(new URL(`../holes/${b.dataset.start}.json`, location.href))).json()).hole;
      h.title = `${h.title} (remix)`;
      commit(h);
      setTarget(null);
      say("Loaded the demo. Make it your own, then share it.");
    } catch (e) { say(`Couldn't load the demo (${e.message}).`, true); }
  });

  // ---------- sharing ----------
  el.copy.addEventListener("click", async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); say("Link copied. Anyone with it can watch your rabbit hole."); }
    catch { el.link.focus(); el.link.select(); say("Select the link and copy it."); }
    track("hole_shared");
  });
  el.embed.addEventListener("click", async () => {
    el.embedBox.hidden = false;
    const src = `${new URL(root.dataset.embedPage, location.href).href}#h=${await encodeHole(hole)}`;
    const ta = el.embedBox.querySelector("textarea");
    ta.value = `<iframe src="${src}" title="${(hole.title || "Rabbit hole").replace(/"/g, "&quot;")}" width="560" height="900" style="max-width:100%;border:0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`;
    ta.focus(); ta.select();
    track("embed_copied");
  });
  el.download.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(sanitize(hole).hole, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${(hole.title || "rabbit-hole").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rabbit-hole"}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  el.importBtn.addEventListener("click", () => el.importFile.click());
  el.importFile.addEventListener("change", async () => {
    const f = el.importFile.files?.[0];
    el.importFile.value = "";
    if (!f) return;
    try {
      if (f.size > 500000) throw new Error("That file is too large to be a rabbit hole.");
      const r = sanitize(JSON.parse(await f.text()));
      commit(r.hole);
      say(r.errors.join(" ") || "Imported.");
    } catch (e) { say(`Couldn't import that file: ${e.message}`, true); }
  });

  // ---------- drawing ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function rowHtml(c, depth, i, n) {
    return `<li data-id="${esc(c.id)}">
      <div class="b-clip">
        <button class="b-handle" type="button" aria-label="Move “${esc(c.title)}”: drag, or use the arrow keys, Tab and Shift+Tab" title="Drag to move. Keyboard: ↑ ↓, Tab, Shift+Tab">⠿</button>
        <button class="b-thumb" type="button" data-act="play" title="Preview this clip"><img src="${thumbUrl(c.yt)}" alt="" width="96" height="54" loading="lazy"></button>
        <div class="b-fields">
          <input class="b-ctitle" data-field="title" value="${esc(c.title)}" maxlength="${LIMITS.title}" aria-label="Clip title">
          <div class="b-times">
            <label>Start <input data-field="start" value="${esc(c.start ? formatTime(c.start) : "")}" placeholder="0:00" inputmode="numeric" size="6"></label>
            <label>End <input data-field="end" value="${esc(c.end ? formatTime(c.end) : "")}" placeholder="end" inputmode="numeric" size="6"></label>
            <a href="${watchUrl(c)}" target="_blank" rel="noopener" class="b-yt">on YouTube</a>
          </div>
          <input class="b-note" data-field="note" value="${esc(c.note || "")}" maxlength="${LIMITS.note}" placeholder="Note (optional): why watch this?" aria-label="Note for viewers">
        </div>
        <div class="b-actions">
          <button type="button" data-act="up" ${i === 0 ? "disabled" : ""} title="Move up" aria-label="Move up">↑</button>
          <button type="button" data-act="down" ${i === n - 1 ? "disabled" : ""} title="Move down" aria-label="Move down">↓</button>
          <button type="button" data-act="indent" ${i === 0 || depth + 1 >= LIMITS.depth ? "disabled" : ""} title="Put it in the deeper track of the clip above" aria-label="Make it a deeper clip of the one above">⇥</button>
          <button type="button" data-act="outdent" ${depth === 0 ? "disabled" : ""} title="Move it out of this deeper track" aria-label="Move out of the deeper track">⇤</button>
          <button type="button" data-act="deeper" class="b-add-deeper" ${depth + 1 >= LIMITS.depth ? "disabled" : ""}>+ Deeper</button>
          <button type="button" data-act="remove" title="Remove" aria-label="Remove “${esc(c.title)}”">✕</button>
        </div>
      </div>
      ${c.deeper ? `<ol class="b-track deeper" aria-label="Deeper track under ${esc(c.title)}">${c.deeper.map((d, j) => rowHtml(d, depth + 1, j, c.deeper.length)).join("")}</ol>` : ""}
    </li>`;
  }

  let previewKey = "";
  function render() {
    if (document.activeElement !== el.title) el.title.value = hole.title === "Untitled rabbit hole" ? "" : hole.title || "";
    if (document.activeElement !== el.about) el.about.value = hole.about || "";
    const keep = document.activeElement?.closest?.("[data-field]") ? { id: document.activeElement.closest("[data-id]")?.dataset.id, field: document.activeElement.dataset.field } : null;
    el.tree.innerHTML = hole.track.length ? `<ol class="b-track main" aria-label="Main track">${hole.track.map((c, i) => rowHtml(c, 0, i, hole.track.length)).join("")}</ol>` : "";
    el.empty.hidden = !!hole.track.length;
    if (keep?.id) el.tree.querySelector(`[data-id="${CSS.escape(keep.id)}"] [data-field="${keep.field}"]`)?.focus();
    const s = stats(hole);
    el.stats.textContent = s.clips ? `${s.clips} clip${s.clips === 1 ? "" : "s"} · ${s.depth} level${s.depth === 1 ? "" : "s"} deep` : "";
    el.undo.disabled = !undoStack.length;
    updateShare();
  }

  async function updateShare() {
    const clean = sanitize({ ...hole, title: hole.title || "Untitled rabbit hole" }).hole;
    const has = clean.track.length > 0;
    for (const b of [el.copy, el.open, el.embed, el.download]) b.toggleAttribute("disabled", !has);
    if (!has) { shareUrl = ""; el.link.value = ""; el.size.textContent = ""; refreshPreview(clean); return; }
    const h = await encodeHole(clean);
    shareUrl = `${new URL(root.dataset.watch, location.href).href}#h=${h}`;
    el.link.value = shareUrl;
    el.open.href = shareUrl;
    el.size.textContent = shareUrl.length > 6000 ? `This link is ${shareUrl.length.toLocaleString()} characters long. It works, but some apps shorten long links: share it by copying, or download the file.` : "";
    refreshPreview(clean);
  }

  function refreshPreview(clean) {
    const key = JSON.stringify(clean.track);
    if (key === previewKey && player) return;
    const at = player?.current;
    previewKey = key;
    player?.destroy();
    player = null;
    if (!clean.track.length) { el.preview.innerHTML = '<p class="muted">Add a video and the preview appears here.</p>'; return; }
    player = mountPlayer(el.preview, clean, { at, autoplay: false, shareBase: new URL(root.dataset.watch, location.href).href, embedUrl: async (w) => `${new URL(root.dataset.embedPage, location.href).href}#h=${await encodeHole(clean)}${w ? `&at=${w}` : ""}` });
    window.__rabbithole = player;
  }

  function focusClip(id, what = "title") {
    const row = el.tree.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    (what === "handle" || what === "up" || what === "down" || what === "indent" || what === "outdent" ? row.querySelector(".b-handle") : row.querySelector(".b-ctitle"))?.focus();
  }
  function findClip(id) { let f = null; (function w(t) { for (const c of t) { if (c.id === id) f = c; if (c.deeper) w(c.deeper); } })(hole.track); return f; }
  function countClips() { return stats(hole).clips; }
  function say(t, bad = false) { el.msg.textContent = t; el.msg.classList.toggle("bad", bad); }

  window.__builder = { get hole() { return hole; }, get shareUrl() { return shareUrl; }, newClipId: () => newClipId(hole) };
}
