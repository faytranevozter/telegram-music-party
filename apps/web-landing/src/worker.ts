/**
 * Static site router for ytparty.my.id.
 *
 * Serves the landing page, privacy policy, and support page. The privacy page
 * is generated from the root PRIVACY.md at build time so the Chrome Web Store
 * listing and the repository cannot drift apart.
 */

interface Env {
    ASSETS: Fetcher;
}

const PAGES: Record<string, string> = {
    "/": "index.html",
    "/privacy": "privacy.html",
    "/support": "support.html",
    "/privacy/": "privacy.html",
    "/support/": "support.html",
};

const NOT_FOUND = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found — YouTube Music Party</title>
<link rel="icon" href="/icon-128x128.png">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<main>
<h1>Page not found</h1>
<p>The page you requested does not exist.</p>
<p><a href="/">Back to home</a></p>
</main>
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

        // ASSETS rejects unknown paths as 500; a static site should say 404.
        if (!response.ok && response.status >= 500) {
            return new Response(NOT_FOUND, {
                status: 404,
                headers: { "content-type": "text/html; charset=utf-8" },
            });
        }

        return response;
    },
};
