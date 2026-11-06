# House-party playlist

## Direction

The landing is an invitation for a Telegram group and its playback host, not a
multi-device streaming service. Energy 3 / Rhythm 3 / Motion 1. The agreed plan's
outline is implemented as invitation → shared controls → sequential setup →
hosting/privacy. All content is grounded in the root README, extension README,
analytics documentation, privacy policy, support guide, and gateway admission.

## Tokens and reasons

- Paper `#FFFFFF`: a deliberate fixed light theme makes setup and policy copy
  readable; dark screenshots remain genuine product captures, not recolored UI.
- Ink `#20242C`: headings and primary reading text.
- Cobalt `#2845C7`: install action, links, keyboard focus, and setup sequence.
- Party yellow `#F5CF49`: only the connected screenshot backdrop gets the party
  accent, keeping the expressive headline and product evidence the focal point.
- Mist `#EEF2F7`: separates the practical setup instructions from the invitation.
- Slate `#536174`: secondary copy; contrast checked against paper and mist.
- Bricolage Grotesque 700: friendly display typography for landing headings;
  locally served Latin WOFF2, SIL Open Font License in `public/fonts/OFL.txt`.
  Native sans-serif handles instructions and support; monospace is for commands.
- Minimal 5px action corners / 14px section and image frames: controls remain
  purposeful without turning the page into a repeated rounded-card grid.

## Composition and restraint

```text
brand                                      setup / support
large invitation                  yellow + actual popup
install / setup                   precise capture caption
one-player explanation
group introduction                open shared-control list
numbered desktop setup            actual join form
self-hosting                      data destination / privacy
footer links
```

Everything is left aligned. The feature rows borrow the ordering of a shared
queue, but have no invented songs, activity counters, timestamps, or live badges.
Numbers appear only on the genuinely sequential setup. The initial generic
feature-card possibility was rejected in favor of this open list. No animation,
autoplay, scroll effects, or landing JavaScript. Focus, hover, and pressed states
give user-triggered feedback; reduced motion explicitly disables motion.

## Capture provenance and inline decisions

- Captured November 6, 2026 from the installed current extension, v1.10.0, using
  Playwright. `popup-join.webp` shows the real disconnected form with Advanced
  expanded, the user-approved Room ID `tangy-gear-leading`, and the exact host
  `https://music.ytparty.my.id/`.
- `popup-connected.webp` shows genuine public-server admission to that room, with
  real YouTube Music page metadata and its player/autoplay queue. The track is
  in **Standby**, as captured; this is not presented as evidence of audible play.
- These replace the earlier local capture at the user's request. No proxy,
  status fixture, or local backend was used for the replacement screenshots.
- Lossless WebP keeps small interface text intact: connected 26,010 bytes,
  join form 24,300 bytes, Telegram 6,958 bytes. All are dimensioned and linkable;
  the hero has high fetch priority, and the setup image is lazy loaded.
- `telegram-room.webp` is the genuine `/register` reply from the authorized
  `@xmsc_bot` conversation, cropped to the reply bubble only. No usernames,
  account/chat identifiers, sidebar, or other conversation history are exposed.
  Only the two user-authorized chats were inspected; no history was cleared.
  The supplied group had no registered room; the supplied Room ID belongs to the
  bot conversation, so the bot reply supplies the setup evidence.
  Existing outdated screenshot composites are no longer
  referenced by the landing; original documentation assets remain untouched.
- Shared light tokens align support/privacy without applying landing typography
  or layout to their prose. Privacy content still comes only from `PRIVACY.md`.

## Acceptance record

### Clean walkthrough

Latest Telegram assets begin with an empty authorized bot chat and `/start`,
then progress through registration and genuine actions without old debugging
conversation. The room and analytics are preserved. Added empty/start images to
the gallery; restored the join form beside the homepage setup steps, with a
gallery link in the caption. Full mobile-window framing remains unchanged.

### Full Telegram window captures (latest request)

Replaced every cropped/padded Telegram asset with an unmodified full mobile
viewport screenshot: 430×932, or 430×1500 for the long configuration screen.
Header, surrounding authorized conversation, and composer remain visible. No
message-only crop, artificial image padding, or recoloring is used. Native
Telegram light/dark themes are retained; external gallery stages provide spacing.
This supersedes the earlier bubble-crop and file-level-padding decisions.

### Completed request sequence

The deployed search fix allowed real Justin Bieber search and selection captures.
The gallery now includes Add to Queue success for Sorry, optional Play Next for
Baby, its success confirmation, and the same request in the extension queue.
All Telegram assets retain 32px file-level padding. Play Next is explicitly
described as room-configurable; the demo setting was restored after capture.
This supersedes earlier blocked-search/callback notes in the verification history.

### Gallery refinement (latest direction)

The user rejected the yellow stage and inline screenshot density. All product
screenshots now live at `/gallery` (also `/gallery/`); the landing links to it.
Mist replaces yellow. Each gallery image has a 36px quiet stage on desktop,
native-size rendering where space allows, and an original-image link. Telegram
uses 430px mobile capture width, preserving the full command/reply while omitting
unrelated history; light and dark captures sit in spacious frames. At tablet
width the gallery stacks rather than making interface text miniature.

The current example is actual “Baby (feat. Ludacris)” by Justin Bieber. Playback
was confirmed as Playing on the public host before capture. Join-form label/value
overlap was a real popup CSS issue, fixed by outside labels and separate input
heights; the 400×531 capture was visually inspected for readable values. This
supersedes the earlier yellow, track, and tight-crop decisions below.

### Popup redesign and action captures

The popup now uses a listening-desk composition instead of equal stacked cards:
slate base `#151922`, track surface `#232D43`, pale cobalt action `#ADC2FF`,
white `#F5F7FC`, and secondary `#BDCAE3`. Native sans typography uses a 23px
track title and 44–52px controls. Connection details remain visible but quieter;
the idle-dialog preference lives under Player settings. Existing admission,
bridge, recovery, and queue logic are unchanged. DOM order matches keyboard order.

The latest connected image replaces the earlier Standby capture: actual playback
of “Why'd You Have To Leave?” by The Neighbourhood was confirmed by the popup's
Playing state, and Pause/Play were exercised. The setup image is a genuine crop
to the form (400×473), not a resized full empty dashboard. Connected: 400×1018.

Telegram action captures show an actual `/queue` exchange from the authorized bot
chat at a 390px viewport, in Telegram's native light and dark themes (media theme
preference, no recoloring). Only the conversation pane is captured, excluding the
chat list. Registration evidence is retained for setup. No other chats were read
or cleared. These action images are static evidence, not live activity.

See `VERIFICATION.md` for local runtime, navigation, responsive, accessibility,
and antislop delivery evidence. No Lighthouse or Web Vitals scores are claimed.
