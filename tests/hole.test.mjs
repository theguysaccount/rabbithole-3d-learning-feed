// Unit tests for the rabbit-hole model: link parsing, cleaning, navigation, sharing and editing.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseTime, formatTime, parseYouTube, sanitize, navigator, encodeHole, decodeHole, readHash, stats,
  addClip, removeClip, moveClip, indent, outdent, moveTo, updateClip, LIMITS } from "../site/assets/js/hole.js";

const sample = () => sanitize({
  title: "T", track: [
    { id: "a", yt: "aircAruvnKk", title: "A", deeper: [{ id: "a1", yt: "fNk_zzaMoSs", title: "A1", deeper: [{ id: "a1x", yt: "kYB8IZa5AuE", title: "A1x" }] }, { id: "a2", yt: "k7RM-ot2NWY", title: "A2" }] },
    { id: "b", yt: "IHZwWFHWa-w", title: "B" },
    { id: "c", yt: "Ilg3gGewQ5U", title: "C", deeper: [{ id: "c1", yt: "tIeHLnjs5U8", title: "C1" }] },
  ],
}).hole;

test("times: the formats people paste", () => {
  assert.equal(parseTime("90"), 90);
  assert.equal(parseTime("90s"), 90);
  assert.equal(parseTime("1:30"), 90);
  assert.equal(parseTime("1:02:03"), 3723);
  assert.equal(parseTime("1m30s"), 90);
  assert.equal(parseTime("1h2m3s"), 3723);
  assert.equal(parseTime("soon"), null);
  assert.equal(parseTime(""), null);
  assert.equal(formatTime(3723), "1:02:03");
  assert.equal(formatTime(65), "1:05");
});

test("YouTube links: watch, youtu.be, shorts, embed, nocookie, live, bare ids, timestamps", () => {
  const id = "aircAruvnKk";
  for (const u of [`https://www.youtube.com/watch?v=${id}`, `youtube.com/watch?v=${id}&list=PLx`, `https://m.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`, `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `https://www.youtube.com/live/${id}`, id]) assert.equal(parseYouTube(u)?.yt, id, u);
  assert.equal(parseYouTube(`https://youtu.be/${id}?t=95`).start, 95);
  assert.equal(parseYouTube(`https://www.youtube.com/watch?v=${id}&t=1m35s`).start, 95);
  for (const u of ["https://vimeo.com/123", "https://www.youtube.com/watch?v=short", "https://evil.example/watch?v=aircAruvnKk", "", "javascript:alert(1)"]) assert.equal(parseYouTube(u), null, u);
});

test("sanitize: drops bad clips, keeps ids unique, enforces limits, never throws", () => {
  const { hole, errors } = sanitize({ title: "x".repeat(500), track: [
    { yt: "aircAruvnKk", title: "ok", start: "1:00", end: "0:30" },
    { yt: "not-an-id", title: "bad" },
    { id: "dup", yt: "IHZwWFHWa-w", title: "<b>one</b>" },
    { id: "dup", yt: "Ilg3gGewQ5U", title: "two" },
    null,
  ] });
  assert.equal(hole.track.length, 3);
  assert.equal(hole.title.length, LIMITS.holeTitle);
  assert.equal(hole.track[0].start, 60);
  assert.ok(!("end" in hole.track[0]), "end before start is dropped");
  assert.equal(new Set(hole.track.map((c) => c.id)).size, 3);
  assert.equal(hole.track[1].title, "<b>one</b>", "text is kept as text; the player escapes it");
  assert.ok(errors.length >= 2);
  for (const junk of [null, 42, "x", [], { track: "nope" }]) assert.deepEqual(sanitize(junk).hole.track, []);
  let deep = [{ yt: "aircAruvnKk", title: "x" }];
  for (let i = 0; i < 10; i++) deep = [{ yt: "aircAruvnKk", title: `d${i}`, deeper: deep }];
  assert.ok(stats(sanitize({ track: deep }).hole).depth <= LIMITS.depth);
  const many = Array.from({ length: LIMITS.clips + 20 }, () => ({ yt: "aircAruvnKk", title: "m" }));
  assert.equal(sanitize({ track: many }).hole.track.length, LIMITS.clips);
});

test("navigation: next, previous, deeper, back out, what plays after, trail and tour", () => {
  const n = navigator(sample());
  assert.equal(n.first, "a");
  assert.equal(n.next("a"), "b");
  assert.equal(n.prev("b"), "a");
  assert.equal(n.prev("a"), null);
  assert.equal(n.deeper("a"), "a1");
  assert.equal(n.deeper("b"), null);
  assert.equal(n.out("a1x"), "a1");
  assert.equal(n.out("a"), null);
  assert.equal(n.after("a1x"), "a2", "end of a deeper track continues in the track above");
  assert.equal(n.after("a2"), "b");
  assert.equal(n.after("c1"), null, "the very end");
  assert.deepEqual(n.trail("a1x").map((c) => c.id), ["a", "a1", "a1x"]);
  assert.deepEqual(n.tour(), ["a", "a1", "a1x", "a2", "b", "c", "c1"]);
  assert.equal(n.size, 7);
});

test("sharing: encode and decode round-trip, damaged links explain themselves", async () => {
  const h = sample();
  const code = await encodeHole(h);
  assert.match(code, /^1[zj]\.[A-Za-z0-9_-]+$/);
  const back = await decodeHole(code);
  assert.deepEqual(back.hole, h);
  const big = sanitize({ title: "Big", track: Array.from({ length: 60 }, (_, i) => ({ yt: "aircAruvnKk", title: `Clip number ${i} about something`, note: "A note that repeats a lot." })) }).hole;
  const bigCode = await encodeHole(big);
  assert.ok(bigCode.length < JSON.stringify(big).length / 2, `compressed ${bigCode.length} vs ${JSON.stringify(big).length}`);
  await assert.rejects(decodeHole("hello"), /doesn't contain/);
  await assert.rejects(decodeHole("1z.AAAA"), /damaged/);
  await assert.rejects(decodeHole("1j.e30x"), /damaged/);
  assert.deepEqual(readHash("#h=1z.abc&at=b&t=1m"), { h: "1z.abc", at: "b", t: 60 });
});

test("editing: add, update, remove, reorder, indent, outdent, drag and drop", () => {
  let h = sample();
  const r = addClip(h, { yt: "eMlx5fFNoYc", title: "New" }, "b");
  h = r.hole;
  assert.equal(navigator(h).deeper("b"), r.id);
  h = updateClip(h, r.id, { start: 10, end: null, note: "" });
  assert.equal(navigator(h).at(r.id).clip.start, 10);
  assert.ok(!("end" in navigator(h).at(r.id).clip) && !("note" in navigator(h).at(r.id).clip));
  h = removeClip(h, r.id);
  assert.equal(navigator(h).at("b").clip.deeper, undefined, "an empty deeper track disappears");
  h = moveClip(h, "c", -1);
  assert.deepEqual(h.track.map((c) => c.id), ["a", "c", "b"]);
  assert.deepEqual(moveClip(h, "a", -1).track.map((c) => c.id), ["a", "c", "b"], "can't move past the start");
  h = indent(h, "b");
  assert.equal(navigator(h).out("b"), "c");
  h = outdent(h, "b");
  assert.deepEqual(h.track.map((c) => c.id), ["a", "c", "b"]);
  h = moveTo(h, "b", "a1x", "inside");
  assert.equal(navigator(h).out("b"), "a1x");
  h = moveTo(h, "b", "a", "before");
  assert.equal(h.track[0].id, "b");
  assert.equal(moveTo(h, "a", "a1x", "inside"), h, "a clip can't be dropped inside itself");
  assert.equal(stats(h).clips, 7);
});

test("demo paths are valid and every video id is checked by the embed check", () => {
  const avail = JSON.parse(fs.readFileSync(new URL("../data/availability.json", import.meta.url), "utf8"));
  for (const f of fs.readdirSync(new URL("../site/holes/", import.meta.url)).filter((x) => x.endsWith(".json"))) {
    const raw = JSON.parse(fs.readFileSync(new URL(`../site/holes/${f}`, import.meta.url), "utf8"));
    const { hole, errors } = sanitize(raw);
    assert.deepEqual(errors, [], f);
    assert.ok(raw.slug && raw.description && raw.description.length >= 50, `${f}: slug and description`);
    assert.ok(hole.track.length >= 3, `${f}: a main track worth exploring`);
    assert.ok(stats(hole).depth >= 2, `${f}: at least one go-deeper path`);
    for (const id of navigator(hole).tour()) assert.ok(avail.videos[navigator(hole).at(id).clip.yt], `${f}: ${id} not in availability.json; run npm run embeds`);
  }
});
