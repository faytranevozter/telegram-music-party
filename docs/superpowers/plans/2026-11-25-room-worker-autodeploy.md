# Room Worker Auto-Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Steps use checkbox syntax for tracking.

**Goal:** Rebuild and deploy the standalone frontend when relevant changes reach `main` or `master`.

**Architecture:** Mirror the landing deployment in its own workflow. A static-only Wrangler config targets the already-live Worker and custom domain.

**Tech Stack:** GitHub Actions, pnpm, Vite, Cloudflare Wrangler.

**Spec:** [Room Worker auto-deploy](../specs/2026-11-25-room-worker-autodeploy-design.md)

## Global Constraints

- No push or deployment in this session. Keep landing, extension and API unchanged.
- Build with `VITE_PARTY_API_ORIGIN=https://music.ytparty.my.id`; use Cloudflare credentials only for deploy.

## Review Focus

- Preview URLs stay disabled, and builds outside `main` and `master` cannot deploy to the production room domain.
- Backend-only changes do not trigger the room workflow; shared package inputs do.

### Task 1: Add and validate isolated deployment configuration

- [x] Check the room workflow and Wrangler contract before adding them; expect missing files.
- [x] Add `.github/workflows/web-room-deploy.yml` and `apps/web/wrangler.toml` with the above scope.
- [x] Re-run the contract check, validate workflow syntax, run room tests, build with the production origin, and run `wrangler deploy --dry-run`. Expect all checks to pass without uploading.
