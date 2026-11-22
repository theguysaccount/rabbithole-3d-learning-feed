// The player for shared rabbit holes: the whole hole travels in the link (#h=…), so nothing is
// stored on a server. #at=… opens it at a particular clip.
import { decodeHole, readHash, encodeHole } from "./hole.js";
import { mountPlayer } from "./player.js";

const root = document.getElementById("player");
const status = document.getElementById("watch-status");
const embed = document.documentElement.dataset.embed === "1";

async function open() {
  const { h, at } = readHash(location.hash);
  const params = new URLSearchParams(location.search);
  let hole, errors = [], slug = null;
  try {
    if (h) ({ hole, errors } = await decodeHole(h));
    else if (params.get("hole") && /^[a-z0-9-]{1,60}$/.test(params.get("hole"))) {
      slug = params.get("hole");
      const res = await fetch(new URL(`../holes/${slug}.json`, location.href));
      if (!res.ok) throw new Error("That demo rabbit hole doesn't exist.");
      const { sanitize } = await import("./hole.js");
      ({ hole, errors } = sanitize(await res.json()));
    } else throw new Error("This link doesn't contain a rabbit hole yet.");
  } catch (e) {
    status.hidden = false;
    status.innerHTML = `<b>${e.message}</b> <a href="${root.dataset.build}">Make your own rabbit hole</a> or <a href="${root.dataset.home}">try a demo</a>.`;
    return;
  }
  if (!hole.track.length) {
    status.hidden = false;
    status.innerHTML = `<b>This rabbit hole is empty.</b> <a href="${root.dataset.build}">Add some videos to it</a>.`;
    return;
  }
  if (errors.length) { status.hidden = false; status.textContent = errors.join(" "); }
  document.title = `${hole.title} · Rabbit Hole`;
  const watchBase = new URL(root.dataset.watch || ".", location.href).href;
  const embedBase = new URL(root.dataset.embedPage || "../embed/", location.href).href;
  const player = mountPlayer(root, hole, {
    at, embed, slug,
    shareBase: slug ? new URL(`../holes/${slug}/`, location.href).href : watchBase,
    buildUrl: embed ? null : root.dataset.build + (h ? `#h=${h}` : slug ? `?from=${slug}` : ""),
    embedUrl: async (where) => slug ? `${embedBase}?hole=${slug}${where ? `#at=${where}` : ""}` : `${embedBase}#h=${await encodeHole(hole)}${where ? `&at=${where}` : ""}`,
    onMove: (id) => {
      const p = new URLSearchParams(location.hash.slice(1));
      p.set("at", id);
      history.replaceState(null, "", `#${p.toString()}`);
    },
  });
  window.__rabbithole = player;
}
open();
addEventListener("hashchange", () => { if (readHash(location.hash).h !== window.__lastH) location.reload(); });
window.__lastH = readHash(location.hash).h;
