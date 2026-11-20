#!/usr/bin/env node
/**
 * Generates apps/web-landing/public/privacy.html from the root PRIVACY.md.
 *
 * Keeping one source of truth matters here: the Chrome Web Store listing, the
 * extension package, and the repository all point at the same policy text.
 * Run `pnpm --filter=web-landing build:privacy` after editing PRIVACY.md.
 */
import { buildLegalPage } from "./legal-page.mjs";

buildLegalPage({
    source: "PRIVACY.md",
    slug: "privacy",
    title: "Privacy Policy — YouTube Music Party",
    description:
        "How the YouTube Music Party browser extension handles your information.",
});
