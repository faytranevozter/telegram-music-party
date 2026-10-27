#!/usr/bin/env node
/**
 * Generates apps/web-landing/public/privacy.html from the root PRIVACY.md.
 *
 * Keeping one source of truth matters here: the Chrome Web Store listing, the
 * extension package, and the repository all point at the same policy text.
 * Run `pnpm --filter=web-landing build:privacy` after editing PRIVACY.md.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = resolve(root, "PRIVACY.md");
const target = resolve(root, "apps/web-landing/public/privacy.html");

const LAST_UPDATED = /^\*\*Last updated:\*\*\s*(.+)$/m;

function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/** Minimal markdown -> HTML for the subset PRIVACY.md uses. */
function render(md) {
    const blocks = [];
    const lines = md.split("\n");
    let i = 0;

    const inline = (text) => {
        let out = escapeHtml(text);
        // [label](url)
        out = out.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            (_, label, href) => `<a href="${href}">${label}</a>`,
        );
        out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
        return out;
    };

    while (i < lines.length) {
        const line = lines[i];

        // Fenced code
        if (line.startsWith("```")) {
            i++;
            const buf = [];
            while (i < lines.length && !lines[i].startsWith("```")) {
                buf.push(lines[i++]);
            }
            i++;
            blocks.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
            continue;
        }

        // Table
        if (line.includes("|") && lines[i + 1]?.match(/^\|[\s:|-]+\|$/)) {
            const header = line
                .split("|")
                .slice(1, -1)
                .map((c) => c.trim());
            i += 2;
            const rows = [];
            while (i < lines.length && lines[i].includes("|")) {
                rows.push(
                    lines[i]
                        .split("|")
                        .slice(1, -1)
                        .map((c) => c.trim()),
                );
                i++;
            }
            const head = header.map((h) => `<th>${inline(h)}</th>`).join("");
            const body = rows
                .map(
                    (r) =>
                        `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`,
                )
                .join("");
            blocks.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
            continue;
        }

        // Heading
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            const level = heading[1].length;
            blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            i++;
            continue;
        }

        // List
        if (/^[-*]\s+/.test(line)) {
            const buf = [];
            while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
                buf.push(lines[i++].replace(/^[-*]\s+/, ""));
            }
            blocks.push(
                `<ul>${buf.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`,
            );
            continue;
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
            blocks.push("<hr>");
            i++;
            continue;
        }

        // Blank
        if (!line.trim()) {
            i++;
            continue;
        }

        // Paragraph (consume until blank/structural)
        const buf = [];
        while (
            i < lines.length &&
            lines[i].trim() &&
            !/^(#{1,6}\s|[-*]\s|```|\|)/.test(lines[i])
        ) {
            buf.push(lines[i++]);
        }
        blocks.push(`<p>${inline(buf.join(" "))}</p>`);
    }

    return blocks.join("\n");
}

const md = readFileSync(source, "utf8");
const updated = md.match(LAST_UPDATED)?.[1]?.trim() ?? "";
const body = render(md.replace(LAST_UPDATED, "").trim());

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — YouTube Music Party</title>
<meta name="description" content="How the YouTube Music Party browser extension handles your information.">
<link rel="icon" href="/icon-128x128.png">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<main>
${updated ? `<p class="updated">Last updated: ${escapeHtml(updated)}</p>` : ""}
${body}
</main>
<footer>
<a href="/">Home</a>
<a href="/support">Support</a>
<a href="https://github.com/faytranevozter/telegram-music-party">Source</a>
</footer>
</body>
</html>
`;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, html);
console.log(`wrote ${target} (${html.length} bytes)`);
