# LAUNCH

## What's live

- https://theguysaccount.github.io/rabbithole-3d-learning-feed/ (GitHub Pages, deployed by `.github/workflows/pages.yml`)
- Pages: home with a playable demo, builder, three demo paths, "branching video" and "interactive YouTube playlist" landing pages, privacy, guides (one more each Monday until 28 December 2026). Watch and embed players are noindex.
- Search plumbing: sitemap (listed by the account's root robots.txt, rebuilt daily by the `theguysaccount.github.io` repo), IndexNow on every deploy, canonical URLs, JSON-LD (WebApplication, HowTo, FAQPage, ItemList, Article, BreadcrumbList), Open Graph card.

## Custom domain

Nothing here changes DNS. entermyrabbithole.com already runs a separate live site, so the recommended home is a subdomain such as videos.entermyrabbithole.com, set through the one setting `SITE_URL`. Exact records and commands: OPERATIONS.md, key 1.

## First 1,000 users: machine channels (running)

- **Search pages for real queries:** "branching video", "interactive YouTube playlist", "make a video course from YouTube videos", plus guides on embedding rules, course design, clip start/end times and embedding a path on your site.
- **The share loop:** every shared path opens on a page with "Make your own" and "Remix it"; every embed links back to the site from its header.
- **Demo paths as landing pages:** each one is a useful, credited study path that people searching for those topics may land on.
- **GitHub discovery:** public repo with description and topics (branching-video, interactive-video, youtube, learning, education, swipe, playlist, knowledge-tree).

## Human channels: drafts only, nothing sent

- **Show HN:** "Show HN: Rabbit Hole – turn YouTube videos into a path you can swipe deeper into". First comment: the whole path lives in the URL fragment (deflate + base64url), the player is YouTube's own embed, swipes happen below the video so nothing covers the player, and a twice-weekly job checks every demo video is still embeddable.
- **r/edtech, r/Teachers (where allowed), course-creator communities:** "I built a free tool that turns YouTube videos into a course path with optional 'go deeper' detours under each clip. No account; the whole path is in the link. Would love to hear what breaks."
- **Product Hunt tagline:** "Video feeds only go down. This one goes deeper."

## 14-day calendar (machine side)

| Day | What happens on its own |
|---|---|
| 0 (Sun 22 Nov) | Launch deploy, IndexNow, root robots.txt rebuild |
| 1 (Mon 23 Nov) | Embed check (Mon/Thu) |
| 2 (Tue 24 Nov) | Scheduled deploy (Tue/Fri) |
| 3 (Wed 25 Nov) | Live self-test (Wed/Sun) with the real YouTube API |
| 8 (Mon 30 Nov) | Guide "YouTube start and end times" goes live with the next deploy |
| 15 (Mon 7 Dec) | Guide "Embed a video path on your site" goes live |
