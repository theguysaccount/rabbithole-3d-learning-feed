# STATE

- **Started from:** seven short notes (Feb 2023 to Aug 2025): "3D feeds" for rabbit-hole learning, "Left Right Down Swipe for next video (really useful for building knowledge trees)", VideoFunnels, vlog description links, pitch decks you scroll in four directions. No prototype or code existed; the notes were reference only.
- **Domain:** entermyrabbithole.com already serves a separate live site ("Rabbit Hole — One thing led to another", on Vercel). This repo doesn't touch it; OPERATIONS.md key 1 proposes a subdomain.
- **Works (v1, verified 2026-11-22):** player with main track and nested deeper tracks (buttons, arrow keys, swipes, autoplay, map, position links, unplayable-video handling), builder (paste links, oEmbed titles and embeddability check, nest, reorder, drag and drop, undo, local draft, share link, embed code, JSON file), shared-link and embed players, three demo paths, two search landing pages, guides by date.
- **Tested:** 13 unit and build tests; headless-Chrome self-test with a stand-in YouTube player (pages at desktop and phone size, player, swipes, builder, embed) and a separate check against the real YouTube IFrame API.
- **Not verified here:** Safari and Firefox, real phones (Chrome's phone emulation only), YouTube Shorts in the player.
- **Not built:** path analytics, hosted paths with short links, uploaded clips (paid tier, key 3), playlist import (needs a YouTube Data API key, key 5).
- **Worth reusing:** `hole.js` (a tree of clips with share-link encoding), the stand-in YouTube player in `scripts/selftest.mjs`, the oEmbed embed check.
