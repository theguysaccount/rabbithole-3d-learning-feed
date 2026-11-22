---
title: Embed an interactive video path on your website or course page
description: How to put a rabbit hole of YouTube videos on any page that accepts an iframe, with sizing advice for desktop and phones.
publish: 2026-12-07
tool: build/
cta: Get an embed code
---
A rabbit hole can live on your own page: a course platform, a blog post, a documentation site or a newsletter archive. The embed is a standard iframe, so it works anywhere you can paste HTML.

## Get the code

In the builder (or under any player) press **Embed** and copy the snippet. It looks like this:

```
<iframe src="https://theguysaccount.github.io/rabbithole-3d-learning-feed/embed/#h=…" title="…" width="560" height="900" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>
```

The part after `#h=` is the whole path, so the embed keeps working even if you never come back to the builder.

## Size it

The embedded player stacks the video, the swipe pad and the map vertically, so it needs height: about 900 pixels shows everything without scrolling inside the frame. On narrow pages, keep `max-width: 100%` so it shrinks with the column.

## Where it works

- **Course platforms** that accept custom HTML or iframes.
- **Blogs and site builders** with an HTML or embed block.
- **Docs sites** built from Markdown that allows raw HTML.

Some platforms only allow iframes from a list of approved sites. If yours does, link to the path instead: the share link opens the full-page player.

## Updating an embedded path

The path is in the link, so changing it means making a new link. Edit the path in the builder, copy the new embed code, and replace the old one.
