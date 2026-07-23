const GITHUB_API =
    "https://api.github.com/repos/faytranevozter/telegram-music-party/releases/latest";
const RELEASES_PAGE =
    "https://github.com/faytranevozter/telegram-music-party/releases/latest";

export type UpdateInfo = {
    currentVersion: string;
    latestVersion: string;
    hasUpdate: boolean;
    downloadUrl: string | null;
    releaseUrl: string;
    tagName: string;
};

function parseSemver(version: string): number[] | null {
    const cleaned = version.trim().replace(/^v/i, "").split("-")[0];
    const parts = cleaned.split(".").map((p) => Number.parseInt(p, 10));
    if (parts.length < 1 || parts.some((n) => Number.isNaN(n))) return null;
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
}

/** Returns true if `latest` is greater than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
    const a = parseSemver(latest);
    const b = parseSemver(current);
    if (!a || !b) return latest.replace(/^v/i, "") !== current.replace(/^v/i, "");

    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return true;
        if (a[i] < b[i]) return false;
    }
    return false;
}

function pickZipAsset(
    assets: Array<{ name: string; browser_download_url: string }>,
): string | null {
    const zip = assets.find(
        (a) =>
            a.name.endsWith(".zip") &&
            (a.name.includes("extension") || a.name.includes("yt-music-party")),
    );
    return zip?.browser_download_url ?? assets.find((a) => a.name.endsWith(".zip"))
        ?.browser_download_url ?? null;
}

export function getCurrentVersion(): string {
    try {
        return chrome.runtime.getManifest().version;
    } catch {
        return "0.0.0";
    }
}

export async function checkForUpdate(): Promise<UpdateInfo> {
    const currentVersion = getCurrentVersion();
    const res = await fetch(GITHUB_API, {
        headers: {
            Accept: "application/vnd.github+json",
        },
    });

    if (!res.ok) {
        throw new Error(`Update check failed (${res.status})`);
    }

    const data = (await res.json()) as {
        tag_name: string;
        html_url?: string;
        assets?: Array<{ name: string; browser_download_url: string }>;
    };

    const latestVersion = data.tag_name.replace(/^v/i, "");
    const downloadUrl = pickZipAsset(data.assets ?? []);

    return {
        currentVersion,
        latestVersion,
        hasUpdate: isNewerVersion(latestVersion, currentVersion),
        downloadUrl,
        releaseUrl: data.html_url || RELEASES_PAGE,
        tagName: data.tag_name,
    };
}

export { RELEASES_PAGE };
