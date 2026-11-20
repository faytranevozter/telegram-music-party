#!/usr/bin/env node
/**
 * Generates apps/web-landing/public/terms.html from the root TERMS.md.
 *
 * The published URL (https://ytparty.my.id/terms) is the one used in the
 * OAuth consent screen's "Application terms of service link" field.
 * Run `pnpm --filter=web-landing build:terms` after editing TERMS.md.
 */
import { buildLegalPage } from "./legal-page.mjs";

buildLegalPage({
    source: "TERMS.md",
    slug: "terms",
    title: "Terms of Service — YouTube Music Party",
    description:
        "Terms that apply to the YouTube Music Party browser extension and party server.",
});
