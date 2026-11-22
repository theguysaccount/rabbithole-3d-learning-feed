---
title: "Interactive YouTube playlists: what the embed rules allow"
description: What you can and can't do when you build on YouTube's embedded player, from start and end times to covering the player, downloading and videos that block embedding.
publish: 2026-11-22
tool: interactive-youtube-playlist/
cta: Build an interactive playlist
---
Building something interactive on top of YouTube is allowed, and common, as long as you use YouTube's official embedded player the way it's meant to be used. Here is what that means in practice. (This is a practical summary, not legal advice: YouTube's own terms and developer policies are the authority.)

## What's fine

- **Embedding public videos whose owners allow it.** That's what the embedded player is for. Most uploads allow embedding; some owners switch it off.
- **Choosing which video plays next.** Your page can load any embeddable video into the player in response to the viewer, which is all a branching path does.
- **Start and end times.** The player has its own settings for where a video starts and stops. Using them doesn't change or copy the video.
- **Privacy-enhanced mode.** Serving the player from youtube-nocookie.com is an official option.

## What's not

- **Downloading or re-hosting videos.** Copying a video to your own server, or ripping its audio, is outside what YouTube allows and usually infringes the creator's copyright.
- **Covering or hiding the player.** Don't put your own buttons, overlays or captions on top of the video, and don't hide YouTube's controls or branding. Put your navigation beside or below the player.
- **Blocking ads or tricking autoplay.** The player shows what YouTube decides to show.
- **Pretending the videos are yours.** The player credits the channel; your page shouldn't contradict that.

## When a video stops being embeddable

Owners can switch embedding off or remove a video at any time. A path built on other people's videos needs to handle that gracefully. Rabbit Hole checks each link when you add it, and its player shows a "watch on YouTube" link and moves on if a video can't be played. For the demo paths on this site, a scheduled job asks YouTube every week whether each video is still embeddable and marks the ones that aren't.

## Credit the creators

Even when the rules don't require it, say where the videos come from. On a Rabbit Hole demo page, every clip links to its YouTube page and names the channel.
