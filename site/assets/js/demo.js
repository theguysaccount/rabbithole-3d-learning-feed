// Pages with a rabbit hole built in (the home page and each demo path): the hole's data is in the
// page as JSON, so it plays without any extra request.
import { sanitize, readHash } from "./hole.js";
import { mountPlayer } from "./player.js";

const data = document.getElementById("hole-data");
const root = document.getElementById("player");
if (data && root) {
  const raw = JSON.parse(data.textContent);
  const { hole } = sanitize(raw);
  const unavailable = new Set(JSON.parse(root.dataset.unavailable || "[]"));
  const base = new URL(root.dataset.base || ".", location.href).href;
  const embedBase = new URL(root.dataset.embed || "embed/", location.href).href;
  const p = mountPlayer(root, hole, {
    at: readHash(location.hash).at, slug: raw.slug, unavailable,
    shareBase: base.split("#")[0],
    buildUrl: root.dataset.build ? `${root.dataset.build}?from=${encodeURIComponent(raw.slug)}` : null,
    embedUrl: async (at) => `${embedBase}?hole=${encodeURIComponent(raw.slug)}${at ? `#at=${encodeURIComponent(at)}` : ""}`,
    autoplay: true,
    onMove: (id) => history.replaceState(null, "", `#at=${encodeURIComponent(id)}`),
  });
  window.__rabbithole = p;
}
