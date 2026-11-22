# Rabbit Hole: branching video paths from YouTube clips

**Live:** https://videos.entermyrabbithole.com/ (the GitHub Pages address, https://theguysaccount.github.io/rabbithole-3d-learning-feed/, redirects there)

Video feeds only go down. A rabbit hole goes deeper: arrange YouTube videos into a **main track**, and hang **deeper tracks** off any clip for viewers who want more. Viewers swipe up for the next clip, left to go deeper and right to back out (or use the arrow keys and buttons), with a map of the whole path beside the video. The builder runs in the browser, and the finished path is stored inside its share link, so there's no account, server or database.

- **Player:** YouTube's official IFrame player in privacy-enhanced mode (youtube-nocookie.com), never covered or modified; start and end times per clip; autoplay that continues from a finished side path back to the main track; a map with watched clips; links to a position (`#at=`).
- **Builder:** paste watch, youtu.be or shorts links; titles and embeddability come from YouTube's public oEmbed endpoint (non-embeddable videos are refused); + Deeper, ↑ ↓, ⇥ ⇤, drag and drop (mouse, pen or touch); undo; draft kept in local storage; share link, embed code, JSON download and import.
- **Sharing:** the path is compressed (deflate) into the link's `#h=` fragment, which browsers never send to a server.
- **Demo paths:** three paths built from embeddable educational videos (3Blue1Brown, Crash Course, Ben Eater), each with its own page that credits and links every video. A scheduled job checks with YouTube twice a week that every demo video is still embeddable.

## Run it locally

Requires Node 20+ and Google Chrome (for the tests).

```bash
npm ci
npm run build              # builds dist/ for http://127.0.0.1:4337/rabbithole-3d-learning-feed
npm run serve              # serves dist/ at that address
```

## Test

```bash
npm test                                   # unit and build tests (Node only)
npm run build && node scripts/selftest.mjs # headless Chrome with a stand-in YouTube player: pages, player, swipes, builder, embed
node scripts/selftest.mjs --url https://videos.entermyrabbithole.com/ --real-youtube   # the live site and the real YouTube API
```

## Deploy

Every push to `main` runs `.github/workflows/pages.yml`: tests, build, end-to-end test, deploy, a check that the new build is live, and IndexNow. If any test fails nothing is deployed. The site's address is one setting, the repository variable `SITE_URL`. Every scheduled job and the keys a human can turn (domain, counts, money) are in [OPERATIONS.md](OPERATIONS.md).

## Layout

| Path | What |
|---|---|
| `site/assets/js/hole.js` | the model: link parsing, cleaning, navigation, share-link encoding, editing |
| `site/assets/js/player.js` | the player (YouTube IFrame API, buttons, keys, swipes, map, sharing) |
| `site/assets/js/build.js` | the builder |
| `site/assets/js/demo.js`, `watch.js` | demo pages; the shared-link and embed player |
| `site/pages/` | landing pages, builder, watch and embed pages (JSON front matter) |
| `site/holes/*.json` | the demo paths |
| `data/availability.json` | the embed check's latest answer from YouTube for each demo video |
| `content/guides/` | guides, published on their `publish:` date |
| `scripts/` | build, serve, self-test, embed check, IndexNow, keep-alive, images, screenshots |

## Content and YouTube

Rabbit Hole doesn't host, download or copy videos. Every video belongs to its creator and plays from YouTube in YouTube's own player, under YouTube's terms. Not affiliated with YouTube or the creators. Code: MIT.
