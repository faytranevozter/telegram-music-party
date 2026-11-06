# Landing revamp verification

## Clean-chat walkthrough and homepage setup image

At the user's request, cleared history only in the authorized `@xmsc_bot`
conversation using Telegram's Clear History confirmation. Did not unregister,
delete the room, or clear analytics. Captured the empty mobile window, `/start`,
`/register`, search, selected Baby result, successful Add to Queue, playback/queue
in both themes, vote, stats, top, history, configuration, and Sorry Play Next.
All captures are full viewport screenshots, not cropped messages. Historical
analytics remain real; a clean conversation does not imply a new database.

Restored the dimensioned join-form image directly beside homepage setup steps,
with the gallery link retained in its caption. Homepage/gallery at 320/768/1440:
every image decoded, no overflow, zero axe A/AA/best-practice violations.
Playback paused and room left after captures. No other chats read or cleared.

## Full-window Telegram replacement

All 12 Telegram assets were recaptured with `page.screenshot` on the entire
430px mobile viewport, without an element capture or clip. Header and composer
remain visible; relevant historical responses were centered by native scrolling.
Configuration uses a 1500px-tall viewport; other images are 932px tall.
Only the authorized bot chat was shown, with Telegram's sidebar hidden by its
mobile layout. Play Next was shown for a new selection, that request canceled,
and the room's Play Next setting verified off afterward.

Gallery checked at 320/768/1440: every image decoded, all Telegram originals are
430px wide, no horizontal overflow, zero axe A/AA/best-practice violations.
Captions, alt text, and dimensions updated to match uncropped assets.

## Deployed search follow-up: request sequence completed

- After the user's deployed library fix, actual inline results returned for
  Justin Bieber Baby and Sorry. Captured search, selected result, genuine
  “Sorry added to the queue” confirmation, and Telegram `/play` starting it.
- Captured the optional Play Next button and genuine “Baby will play next”
  confirmation. Confirmed Baby appeared in the popup's User requests while Sorry
  played. No mocked status or fabricated queue data.
- Play Next was temporarily enabled in this authorized test room for the capture;
  verified it was restored to off afterward. Playback paused and room left.
- Inline messages were initially stale after clicks, including the user's manual
  attempt; a fresh result and Telegram reload exposed confirmed success. Config
  Close worked independently. No server patch/restart was made for this follow-up.
- All new Telegram assets include 32px padding on every edge. Added request queue
  capture is 400×1043. All originals linked from the gallery.
- Final homepage/gallery checks at 320/768/1440: every image decoded, no horizontal
  overflow, zero axe WCAG A/AA/best-practice violations. Screens saved as
  `gallery-complete-320.png`, `gallery-complete-768.png`, `gallery-complete-1440.png`
  in the session temp directory. The temporary 8790 preview server was stopped.

## Popup sizing and action coverage follow-up

- Fixed shrink-to-fit feedback from `max-width:100vw`: html/body/root now request
  400px explicitly. At an artificial 180px viewport the content remains 400px
  rather than collapsing. Activated Chrome, successfully called action.openPopup,
  and inspected the real action target with CDP: **400×600**, body width 400.
- Restored the real player image on the homepage without the rejected yellow.
- Telegram queue light/dark, stats, vote, top, history, and configuration assets
  now include 32px padding on every edge in the files themselves (no text edits).
- Reset chat `/register` issued `melodic-name-island`; new actions use it. Older
  setup captures retain their original room ID and are identified as examples.
- Exercised Play/Pause, volume down/up, mute, Next, settings expansion, room
  registration, queue, pause, stats, history, top, mystats, vote, mute/unmute,
  and configuration. Captured genuine pause/settings and bot reply images.
- Inline search returned no results in either authorized Telegram Web chat after
  repeated fresh-editor/reload attempts. Add to queue / Play Next capture remains
  blocked; no private chats, BotFather, or API credentials were accessed.
- Build passed. Homepage/gallery at 320/768/1440: all images decoded, no overflow,
  and zero axe WCAG A/AA/best-practice violations. `git diff --check` passed.

## Latest gallery delivery

- Added `/gallery` and `/gallery/` Worker routes; all five screenshots moved out
  of the landing into the dedicated page. Header links lead to gallery/setup.
- Actual Justin Bieber “Baby” playback captured as Playing; Telegram's real
  `/queue` response shows that same current song in both native themes.
- Join-form overlapping labels fixed in the extension, not edited in an image.
  Visually checked the new 400×531 image. Production build and 63 tests passed.
- Playwright verified `/`, `/gallery`, `/gallery/`, `/support`, `/privacy` at
  320/768/1440px: all HTTP 200, no page overflow, all images decoded, zero axe
  A/AA/best-practice violations. Visually reviewed `gallery-1440.png`; narrow and
  tablet captures saved as `gallery-320.png` and `gallery-768.png`.
- Gallery images have dimensions and original-size links; desktop join image
  renders at native width instead of being squeezed into the onboarding column.
- A pre-existing server occupied 8787, so verification used 8788 without stopping
  the existing listener. The task's own 8788 server was stopped after testing.

Verified locally on November 6, 2026. No production deployment was performed.

## Commands and runtime

- `pnpm install --frozen-lockfile`: passed; no manifest or lockfile changes.
- `pnpm --filter=extension build`: passed all three current extension builds.
- `pnpm --filter=extension test`: 8 files / 63 tests passed.
- `pnpm --filter=web-landing build:privacy`: passed; generated page includes the
  shared header and skip link, with policy content still from `PRIVACY.md`.
- `pnpm --filter=web-landing dev --port 8787`: Wrangler served `/`, `/support`,
  `/privacy`, CSS, local font, icon, and both screenshots successfully. The
  explicit `ASSETS` binding and existing Worker routing were preserved.
- `git diff --check`: passed.

## Browser and accessibility

- Playwright checked all three routes at 320, 375, 768, 900, 1024, and 1440 CSS
  pixels: no page-level horizontal overflow, one h1 per page, and every image
  loaded after scrolling to lazy figures. Direct loads work on each route.
- Actual Chrome default page zoom temporarily set to **200%** through Appearance
  settings: all three pages reflowed to a 720px CSS viewport from 1440px, with no
  overflow. Restored Chrome zoom to 100% afterward.
- axe-core 4.10.3: zero violations for WCAG 2 A/AA, WCAG 2.1 AA, and best-practice
  tags on all three pages. Also checked narrow and tablet layouts. This is an
  automated check, not a claim of full accessibility certification.
- All links have at least 44px target height; inline prose links receive explicit
  target padding. Keyboard starts at the visible-on-focus Skip to content link;
  focus outline measured 3px. Setup anchor resolves to `/#setup`.
- Reduced-motion emulation checked. No landing scripts, animation, autoplay, or
  motion transitions. Hover/pressed install colors and focus states are explicit.
- Text contrast ratios: slate/paper 6.31:1; slate/mist 5.61:1; cobalt/paper
  7.59:1; cobalt/mist 6.75:1; ink/paper 15.55:1.
- No local-site console errors, page errors, or failed network requests during
  the final 18 route/viewport checks. No Lighthouse/Web Vitals scores measured.

## Click-through checks

Clicked the actual links and waited for destination navigation:

- Add to Chrome: existing verified Chrome Web Store product listing.
- Set up your room: local `/#setup`.
- Bot: `https://t.me/xmsc_bot` (no messages sent by this work).
- YouTube Music: `https://music.youtube.com/`.
- Support / Privacy Policy: correct local routes and page titles.
- Source / Report an issue: correct GitHub repository and issues pages.
- Database & deployment guide: repository `blob/main/docs/database.md`.
- Both screenshot links: full-size 400×909 and 400×973 WebP images.

## Design delivery gates

- **Hard:** static semantic header/nav/main/footer; genuine current product
  captures; no made-up room activity, testimonials, cover art, or unsupported
  playback claims. Local font includes its OFL license. No new frontend framework.
- **Purpose:** installation stays primary; popup-first sequence names `/register`,
  default address, Join Room, refresh interruption, Connected, and busy recovery.
  Desktop hosting vs mobile Telegram participation is explicit.
- **Liveliness:** Bricolage display headline and the one yellow screenshot stage
  carry personality; feature rows refer to collective queue control, not a generic
  repeated-card kit. No ornamental motion or fake status indicators.
- **Craftsmanship:** inspected full-page desktop, tablet, and mobile captures.
  Removed whitespace from the join capture; changed stacking breakpoint to 900px
  after tablet inspection showed product text becoming too small. Both images
  link to their original size, have precise alt text/dimensions, and use lossless
  compression. Captions disclose the controlled local capture.
- **Mobile:** 320px verified without clipping. Single-column setup keeps the
  actual interface at useful width; full-size links support closer inspection.
  Support/privacy tables scroll internally rather than widening the page.

Visual evidence was saved under the session temp directory:
`/private/var/folders/7b/wd5yw4p14cj8qt6bm4_35nz80000gp/T/opencode/` as
`landing-desktop.png`, `landing-tablet.png`, `landing-mobile.png`,
`support-320.png`, `privacy-320.png`, and `privacy-200-percent.png`.

## Public-room screenshot update

### Action-capture and popup redesign follow-up

- Extension production build passed; all 63 tests across 8 files passed after
  presentation changes. Playback, recovery, joining, and queue code is unchanged.
- Exercised actual public-server playback: observed Playing, clicked Pause,
  observed Paused, clicked Play, observed Playing, and captured the redesigned UI.
- Requested `/queue` in the authorized bot chat and captured its real current-track
  and upcoming-player list in both native Telegram themes at mobile width.
- Paused playback and left the room afterward. No chat history deleted.
- Landing checked at 320/768/1440: no overflow, zero axe A/AA/best-practice
  violations. All six images decoded successfully, including the narrow layout.
- Extension CSP correctly blocked injecting axe; no CSP was weakened. Extension
  validation uses the production build, 63 tests, and real browser interaction.
- New image sizes: connected 400×1018; cropped join 400×473; mobile Telegram
  light/dark 374×604. Lossless WebP throughout. New evidence:
  `landing-action-320.png`, `landing-action-768.png`, `landing-action-1440.png`.

At the user's request, replaced both extension captures with the actual public
server `https://music.ytparty.my.id/` and room `tangy-gear-leading`. Connected
admission was observed without any request proxy or fixture. The example Room ID
is filled in the join form; visitors are told to paste their own ID.

Added the genuine `/register` reply from the authorized `@xmsc_bot` chat, cropped
to only its reply bubble (345×150). Only the two explicitly authorized chats were
inspected. The supplied group returned “No room found”; registration confirmation
was therefore captured in the bot conversation where the supplied room is linked.
No chat history was cleared. A `/queue` request in the group and `/register`
request in the bot chat were sent for the capture; no other chats were opened.

Rechecked the updated page at 320, 768, and 1440px: all three images loaded, no
horizontal overflow, and zero axe WCAG A/AA / best-practice violations. Visually
inspected `landing-public-1440.png`; narrow/tablet evidence is saved alongside it
as `landing-public-320.png` and `landing-public-768.png` in the same temp directory.
