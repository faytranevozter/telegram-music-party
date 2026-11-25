/**
 * Static site router for ytparty.my.id.
 *
 * Serves the landing page, privacy policy, terms, and support page. The legal
 * pages are generated from the root PRIVACY.md and TERMS.md at build time so
 * the Chrome Web Store listing, the OAuth consent screen, and the repository
 * cannot drift apart.
 */

interface Env {
    ASSETS: Fetcher;
}

const PAGES: Record<string, string> = {
    "/": "index.html",
    "/privacy": "privacy.html",
    "/terms": "terms.html",
    "/support": "support.html",
    "/gallery": "gallery.html",
    "/gallery/": "gallery.html",
    "/privacy/": "privacy.html",
    "/terms/": "terms.html",
    "/support/": "support.html",
};

const NOT_FOUND = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found — YouTube Music Party</title>
<link rel="icon" href="/icon-128x128.png">
<script src="/appearance.js" data-appearance-key="ytmp-site-appearance"></script>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<main>
<h1>Page not found</h1>
<p>The page you requested does not exist.</p>
<p><a href="/">Back to home</a></p>
</main>
<div class="appearance-bar"><label>Appearance <select data-appearance-select><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
</body>
</html>`;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // Only GET/HEAD are meaningful for a static site.
        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Method Not Allowed", { status: 405 });
        }

        // Map a clean path to its asset file, then fall through to ASSETS
        // for anything else (CSS, icons, extension zip).
        const file = PAGES[url.pathname];
        const target = file
            ? new Request(new URL(`/${file}`, url.origin), request)
            : request;

        const response = await env.ASSETS.fetch(target);

        // Asset bindings can return a bare 404 (or a 500 for an unknown path).
        if (response.status === 404 || response.status >= 500) {
            return new Response(request.method === "HEAD" ? null : NOT_FOUND, {
                status: 404,
                headers: { "content-type": "text/html; charset=utf-8" },
            });
        }

        return response;
    },
};
