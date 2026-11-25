# Web Room Entry Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add public web-room links and explain browser-based setup on the landing page.

**Architecture:** Use normal links in the static pages and the extension’s existing tab-opening mechanism in its popup. Keep web-room admission and deployment unchanged.

**Tech Stack:** Static HTML, React, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-web-room-entry-points-design.md`

## Global Constraints

Use `https://room.ytparty.my.id/` with no credentials, player room ID, or invite code. Preserve the existing visual style, extension install link, and Telegram workflow.

## Steps

- [x] In `apps/extension/src/App.spec.tsx`, assert the popup opens the exact public URL in a browser tab, including when connected to a custom server. Run the test and confirm it fails before adding **Open web room** to `apps/extension/src/App.tsx`. Then run the extension suite and build.
- [x] Add **Open web room** to `apps/backend/public/index.html`. Verify its destination and that existing navigation links still work.
- [x] Rewrite `apps/web-landing/public/index.html`: make **Open web room** the primary CTA, retain **Add to Chrome**, describe browser-first setup and host-only audio, and keep Telegram registration as an alternative. Update title, description, and social metadata. Verify links and review the page at narrow and wide widths.
