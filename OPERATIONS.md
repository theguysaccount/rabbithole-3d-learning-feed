# OPERATIONS

Rabbit Hole runs with no human and no server. Every recurring task is a GitHub Actions job in this repository. The site is a static GitHub Pages deployment at https://theguysaccount.github.io/rabbithole-3d-learning-feed/. Rabbit holes live in their share links, and videos play from YouTube, so there is nothing to store, host or back up.

**The site's address is one setting:** the repository variable `SITE_URL`. Empty means the GitHub Pages address above. The build, canonical URLs, sitemap, share links, embed codes, IndexNow and the live checks all read it.

## Automated jobs

| Job | File | When (UTC) | What it does | How it fails safe |
|---|---|---|---|---|
| Deploy site | `.github/workflows/pages.yml` | every push to `main`; Tuesdays 06:29 and Fridays 06:47; by hand; started by the embed check when availability changes | `npm test` (13 unit and build tests), build `dist/` as of today's date, headless-Chrome self-test of the build against a stand-in YouTube player (every page at desktop and phone size, the player's buttons, keys, autoplay and error handling, swipes, the builder including drag and drop and sharing, the embed), deploy to Pages (a second attempt if the first stalls), wait until the live `build.json` shows this commit, check every live page, IndexNow | Any failed step before `deploy` stops the run and the last good deployment stays live. Re-running is always safe. |
| Weekly guide release | the scheduled runs of `pages.yml` | Tuesdays and Fridays | Guides whose `publish:` date has passed go live with a fresh sitemap and feed. Publication is by date, so a skipped run is caught up by the next one. | Same as Deploy. |
| Embed check | `.github/workflows/embeds.yml` | Mondays 05:37 and Thursdays 05:57; by hand; started by the self-test if it's over 10 days stale | Asks YouTube's public oEmbed endpoint (no key) whether each demo video is still embeddable; writes `data/availability.json`. If anything changed: runs the tests, commits, and starts Deploy site, which marks the video and makes the player skip it. If a video is unplayable it opens or updates an issue labelled `embeds`. Records the check time in a commit at most once a week. | A network error keeps the last known result (marked `stale`) and never fails the run. A demo path keeps playing with the rest of its videos. |
| Live self-test | `.github/workflows/selftest.yml` | Wednesdays 08:07 and Sundays 09:13; by hand | Staleness checks first: a live build over 8 days old starts Deploy site; an embed check over 10 days old starts Embed check. Then the full self-test against the live site, plus the real YouTube player API (it must load and report ready, served from youtube-nocookie.com). | Read-only. On failure it opens or comments on an issue labelled `self-test` (GitHub also emails the account owner); the next pass closes it. |
| Keep-alive | `keepalive` job in every scheduled workflow (`scripts/keepalive.sh`) | with each scheduled run | Re-enables every workflow (skips any disabled by hand) and pushes an empty commit after 45 quiet days, so GitHub's 60-day rule never switches the schedules off. The embed check's weekly commit also counts as activity. | Each step tolerates failure; pushes with the workflow token trigger nothing. |
| Pull-request tests | `.github/workflows/test.yml` | pull requests | Same tests as Deploy, no deploy | n/a |

GitHub fires schedules on this account hours late and sometimes not at all. No job depends on its time: guides publish by date, every job runs twice a week, and the self-test restarts whichever job has stalled.

## What to watch

1. **Issues labelled `embeds`:** a demo video stopped being embeddable. The site already copes; a person should pick a replacement (below).
2. **Issues labelled `self-test`:** the live site failed a check; the issue lists what failed and links the run.
3. **Failed-run emails** from GitHub to the account owner.
4. **Counts**, once switched on (key 2). Activation is `event/hole_shared` (a rabbit hole was shared or its link copied). Also `clip_added`, `go_deeper`, `clip_view`, `embed_copied`.

## When a demo video stops being embeddable

1. Open the `embeds` issue to see which video.
2. Find another public video on the same topic. Check it: `node scripts/check-embeds.mjs` after adding it to the right `site/holes/*.json` file (or paste its link in the builder, which refuses non-embeddable videos).
3. Replace the clip's `yt` (keep its `id`, so shared `#at=` links still work), update `title` and `note`, run `npm test`, commit. The deploy and the next embed check close the loop.

## When the live self-test fails

- **"youtube: the real player API loads…" failed:** YouTube changed or blocked its IFrame API, or the runner couldn't reach it. Check https://www.youtube.com/iframe_api from a browser. If YouTube changed the API, update `loadYouTube()` and the player calls in `site/assets/js/player.js` (the stand-in player in `scripts/selftest.mjs` mirrors the calls we use).
- **A player, swipe or builder check failed:** a Chrome change broke an interaction. Run `node scripts/selftest.mjs --url <site> --only player` (or `swipe`, `builder`) locally and read the failing check.
- **"no requests to sites other than YouTube" failed:** something on the page reached another origin. Find the URL in the report and remove it.
- **Page checks with HTTP errors:** GitHub Pages may be down (githubstatus.com) or the Pages source changed. Re-run "Deploy site".

## Keys Jack can turn later

None of these is needed for the site to work.

### 1. Custom domain (the "domain rollout" session handles this; nothing here changes DNS)

**Don't point entermyrabbithole.com itself at this site.** On 2026-11-22 it already served a live site ("Rabbit Hole — One thing led to another", a trail-of-sources product: `www` is a Vercel CNAME, the apex is A `216.150.1.1`, DNS at Namecheap). Under the "never replace, only build on top" rule, the natural home for this tool is a subdomain of it, linked from that site, for example `videos.entermyrabbithole.com`. Also mentioned in Jack's notes: `myrabbithole.com` (resolves to AWS addresses, NameBright DNS) and `rabbithole.me` (GoDaddy DNS); ownership unconfirmed, so leave them alone.

Steps for a subdomain `HOST` (example `videos.entermyrabbithole.com`):
1. DNS: one record, `CNAME videos → theguysaccount.github.io.` (Namecheap: Domain List → entermyrabbithole.com → Advanced DNS → Add new record). Leave the apex and `www` records untouched.
2. `~/.local/bin/gh api -X PUT repos/theguysaccount/rabbithole-3d-learning-feed/pages -f cname=HOST`; when the certificate is issued, `~/.local/bin/gh api -X PUT repos/theguysaccount/rabbithole-3d-learning-feed/pages -F https_enforced=true`.
3. `~/.local/bin/gh variable set SITE_URL -R theguysaccount/rabbithole-3d-learning-feed -b https://HOST`
4. `~/.local/bin/gh workflow run pages.yml -R theguysaccount/rabbithole-3d-learning-feed`. Canonical URLs, the sitemap, share links and embed codes all switch. GitHub redirects the github.io URLs; share links made before the switch keep working through that redirect.

For an apex domain instead: four A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (optionally AAAA `2606:50c0:8000::153` to `2606:50c0:8003::153`) and `www` CNAME `theguysaccount.github.io.`, then steps 2 to 4.

### 2. Counts (privacy-friendly analytics, the "path analytics" starting point)

1. Create a free GoatCounter account (needs a person), for example `rabbithole`. Leave "collect IP addresses" off.
2. `~/.local/bin/gh variable set GOATCOUNTER_URL -R theguysaccount/rabbithole-3d-learning-feed -b https://rabbithole.goatcounter.com/count`, then run "Deploy site".
3. The build adds that origin to the CSP and updates the privacy page. Only event names and page paths are sent, never a rabbit hole's contents or link.

### 3. Money: the creator tier slot

Pages is non-commercial, so the free builder stays free here. The paid tier lives elsewhere: hosted rabbit holes with short links and editable-after-sharing paths, private paths, per-path analytics (which branches viewers take), and uploaded clips (hosting video needs storage and bandwidth, which is why it's paid). Build it on other hosting with Stripe (Jack's account; test mode until he approves live keys), then:
1. `~/.local/bin/gh variable set PRO_URL -R theguysaccount/rabbithole-3d-learning-feed -b https://<creator tier url>` and run "Deploy site". A box appears on the home page and the builder: "Need path analytics, private paths or your own clips?"
2. Optional: `SUPPORT_URL` adds "Support this free tool" to the footer.

### 4. New guides and demo paths without a human

Eight guides were written up front: three live at launch, then one each Monday until 28 December 2026. To keep going, a scheduled Claude routine, monthly, with this repo checked out:
- Read `content/guides/` and `site/holes/`, and Search Console queries if available.
- Write one guide that answers a real question about branching video, video courses or YouTube embeds (no thin pages, no claims about YouTube rules that can't be cited), dated next Monday.
- Optionally add one demo path: 3 to 8 main clips with at least one deeper track, only videos that pass `node scripts/check-embeds.mjs`, credited by title with a one-line note in its own words.
- `npm test`, commit, push. The scheduled deploy publishes it.

### 5. Importing YouTube playlists

Importing a whole playlist needs the YouTube Data API, which needs an API key from a Google Cloud project (a person). With a key restricted to this site's address, the builder could fetch a playlist's videos in one step; record it as a repository variable and add the fetch to `build.js`.

## Local commands

```bash
npm ci && npm test                                            # unit and build tests
npm run build && node scripts/selftest.mjs                    # build + headless end-to-end (stand-in YouTube)
node scripts/selftest.mjs --url https://theguysaccount.github.io/rabbithole-3d-learning-feed/ --real-youtube   # live check
node scripts/check-embeds.mjs                                 # ask YouTube about every demo video
node scripts/make-images.mjs                                  # redraw the share card and icon
```
