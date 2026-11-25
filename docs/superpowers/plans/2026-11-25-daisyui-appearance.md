# DaisyUI Appearance and Public Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a consistent three-mode daisyUI Swap control and redesign the landing site and backend info page using locally bundled daisyUI.

**Architecture:** The early appearance script keeps ownership of preference and uses delegated clicks to synchronize native buttons. The web room uses its existing daisyUI build, the popup loads only the Swap CSS, and the two static sites compile app-local daisyUI styles for their existing static routes.

**Tech Stack:** daisyUI 5.8.2, Tailwind CSS 4, Vite, React, static HTML, Cloudflare Worker, NestJS static assets, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-25-daisyui-appearance-design.md`

## Global Constraints

- Keep **System → Light → Dark → System**, all existing preference keys, early theme application, and live System updates.
- Ship compiled styles locally with no CDN dependency. Keep HeroUI for the rest of the popup.
- The injected YouTube Music UI stays host-themed; Telegram is unchanged.
- Preserve screenshots, links, legal text, reverse-proxy mount paths, and clipboard fallback. Do not add health claims, backend state, or extension permissions.
- Work on top of the existing dark-mode changes in the current checkout. Do not stage `.playwright-mcp/`, push, or deploy.

## Review Focus

- A saved override matching the current system still displays its own mode; a device change cannot override it (Task 1).
- A nested icon click or keyboard activation advances exactly once, even in a React form, without submitting it (Task 1).
- Direct navigation to missing pages and generated legal pages still shows the site theme and proper HTTP status (Task 2).
- A proxied backend page still loads its CSS, appearance script, font, and icon and preserves the mount path when copied (Task 3).
- A rejected clipboard write leaves the address selected and usable at 360 px, with visible keyboard focus (Task 3).

## Steps

### Task 1: Shared swap control

**Files:** `scripts/appearance.js`, `scripts/sync-appearance.mjs`, `scripts/appearance.test.mjs`, `scripts/appearance-surfaces.test.mjs`, four synced `public/appearance.js` copies, web and extension `src/App.tsx`, extension `src/index.css` and `package.json`, `pnpm-lock.yaml`, landing HTML/legal renderer/Worker and backend `public/index.html`.

**Interface:** Each page exposes one `<button type="button" data-appearance-swap>` placeholder. The shared script initializes its icon stack and visible mode label using DOM methods, sets `data-appearance-mode="system|light|dark"`, and sets an accessible name with the current and next mode. The component uses the real `swap`, `swap-on`, `swap-off`, and `swap-active` classes for sun/moon and adds a monitor treatment for System; the CSS respects reduced motion. The early script continues to set the same theme identifiers and popup classes before styles paint.

- [x] Extend `scripts/appearance.test.mjs` to assert three-step wraparound, matching saved override versus System, a blocked-storage click, and continued live system changes after returning to System. Update the surface test to require one native button on each route.
- [x] Run `pnpm --filter=web-landing build:legal && node --test scripts/appearance*.test.mjs`; confirm the new Swap assertions fail before implementation.
- [x] Implement the controller and placeholders, using delegated clicks via `closest('[data-appearance-swap]')`; add a narrow `daisyui/components/swap.css` import to the extension popup only. Sync the public scripts and regenerate legal pages.
- [x] Run the sync check, appearance tests, web and extension tests/lint/build. In Chromium activate the switch from a nested icon and with Enter and Space; verify mode text, theme, focus, reopen persistence, and no form submission. Check System resumes following simulated device changes.

### Task 2: DaisyUI landing site

**Files:** `apps/web-landing/public/{index,gallery,support}.html`, `public/style.css`, `scripts/legal-page.mjs`, `src/worker.ts`, `package.json`, `.gitignore`, `scripts/test-*.mjs`, `.github/workflows/web-deploy.yml`, `turbo.json`, `pnpm-lock.yaml`. Add `apps/web-landing/styles/site.css` to compile to `public/site-ui.css`.

**Interface:** `pnpm --filter=web-landing build` generates legal pages and `public/site-ui.css`. Dev and deployment also compile the stylesheet. The Worker continues to serve `/`, `/gallery`, `/support`, `/privacy`, `/terms`, and a real 404. Landing pages share `ytmp-site-appearance` and use theme names `light` and `dark`.

- [x] Test that all landing routes and the 404 link `/site-ui.css`; assert preserved setup, feedback, and legal links in the existing tests. Confirm the new stylesheet assertions initially fail.
- [x] Add app-local Tailwind 4 CLI and daisyUI 5.8.2 with explicit source paths including `public/*.html`, the legal renderer, Worker, and appearance script. Disable global preflight if it conflicts with the existing editorial styles. Map daisyUI color tokens to the approved palette.
- [x] Redesign the home hero and supporting sections and align gallery, support, legal and 404 navigation, actions, and typography. Use daisyUI buttons, cards, alerts, and shared Swap plus layout CSS; keep body copy, important paths, and existing assets intact. Wire `build`, `dev`, `deploy`, CI, and Turbo outputs so clean builds cannot omit CSS or legal HTML.
- [x] Run landing tests, then use local Wrangler to check rendered routes, shared persistence, legal content, and 404 GET/HEAD semantics. Review both themes at 360 px and desktop for focus, legibility, and overflow.

### Task 3: DaisyUI backend info page and packaged assets

**Files:** `apps/backend/public/index.html`, `apps/backend/package.json`, `apps/backend/Dockerfile`, `turbo.json`, `pnpm-lock.yaml`. Add `apps/backend/styles/server.css` (compiles to `public/server-ui.css`) and `apps/backend/scripts/test-server-info.mjs`.

**Interface:** `pnpm --filter=backend build:info` generates `public/server-ui.css`; `pnpm --filter=backend build` also compiles Nest. The page requests assets using `./` and retains `server-url`, `copy-url`, and `copy-status` for the existing clipboard behavior. Docker explicitly copies the rebuilt public assets from the build stage, not a local generated workspace.

- [x] Test the relative CSS/script links, existing input and status contracts, and packaged asset paths; confirm the new contract initially fails.
- [x] Build a compact daisyUI address panel with a labeled readonly input and clear Copy action; place instructions and links below it. Keep URL normalization and successful/rejected clipboard behavior. Use app-local daisyUI and Tailwind build tooling aligned with the landing app; update dev/build and Docker asset handling. Keep generated CSS out of Git and list it in Turbo build outputs.
- [x] Run backend build and the info-page tests; inspect a clean build and runtime image if Docker is available. In Chromium mount the page beneath a proxy-like path ending in `/index.html?x=1#fragment`; verify all assets load, the displayed/copied URL retains the mount path, and denial selects the address. Check both themes, narrow layout, and keyboard focus.
- [x] Run `git diff --check`, the appearance sync check and tests, and verify all page assets are produced locally. Report browser or container checks that could not run. Leave changes uncommitted unless the user asks for a commit.
