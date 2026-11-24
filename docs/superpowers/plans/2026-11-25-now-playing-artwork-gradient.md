# Now Playing Artwork Gradient Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tint the web room's Now Playing card with a dark gradient from the current artwork.

**Architecture:** Pass the current track's artwork source to `NowPlayingPanel`, which derives a dark gradient from a small client-side canvas sample. Keep displayed artwork loading independent of sampling, leave the existing daisyUI card classes in place, and apply the gradient only when the resolved color matches the current source.

**Tech Stack:** React, TypeScript, daisyUI, Canvas 2D, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-now-playing-artwork-gradient-design.md`

## Global Constraints

- Scope the gradient to the web Now Playing card. Keep the layout, text, controls, and playback behavior unchanged.
- Use existing cover sources, with no metadata lookups or backend changes.
- Keep the current neutral card with no track, while artwork is loading, when offline, or if sampling fails.

## Review Focus

- Old artwork load finishes after a track change: discard the result.
- Thumbnail is blocked, unreadable due to CORS, or has no usable pixels: keep the neutral card; artwork display remains independent.
- The track clears or the player disconnects: remove the gradient immediately.
- White or highly saturated art produces a dark backdrop readable with light controls and text.
- A track change under slow loading shows the neutral background, never the previous track's gradient.

### Task 1: Derive and apply the artwork gradient

**Files:** Create `apps/web/src/artwork-gradient.ts`, `apps/web/src/artwork-gradient.test.ts`, and `apps/web/src/NowPlayingPanel.test.tsx`; modify `apps/web/src/RoomPanels.tsx` and `apps/web/src/Room.tsx`.

**Interfaces:** `artworkGradient(pixels: Uint8ClampedArray): string | undefined` computes CSS from RGBA data; `sampleArtworkGradient(source: string): Promise<string | undefined>` reads image pixels without changing how the cover displays. `NowPlayingPanel` accepts optional `artworkSource?: string`; `Room` passes `coverSources(videoId)[0]` only with an online player and a current track.

- [ ] **Write failing tests.** Assert red RGBA data produces a dark red tint (red greater than green and blue), white artwork remains dark (all RGB channels at most 80), and transparent pixels yield no gradient. Test the sampler returns `undefined` on image failure or blocked canvas read. In panel tests, assert no inline gradient until sampling succeeds, a source change clears the old gradient immediately, an old sampling result cannot replace the current one, and removing the source restores the neutral background.
- [ ] **Run red tests.** `pnpm --filter=web test`; expect the new gradient tests to fail before implementation.
- [ ] **Implement.** Load the source on a separate image with `crossOrigin = 'anonymous'` before assigning `src`, draw into a small canvas, and treat image/context/pixel-read failures as no gradient. Prefer colored pixels over near-gray ones; darken the selected tint to RGB channels no higher than 80 and blend toward a near-black shade of that hue. Keep async results keyed to the source and invalidate the effect on cleanup.
- [ ] **Run verification.** `pnpm --filter=web test`, `pnpm --filter=web build`, `pnpm --filter=web lint`; expect all pass. Inspect the card in a browser at mobile and desktop sizes using red, bright, broken, and missing artwork, verifying the cover, text, and controls remain visible.
- [ ] **Commit.** Stage only the gradient implementation, tests, and its documentation if authorized; leave existing work untouched.
