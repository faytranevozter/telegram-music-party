export type Queue = { id: string; url: string; title?: string };

const artistSelector =
    "div.content-info-wrapper.style-scope.ytmusic-player-bar > span > .subtitle.style-scope.ytmusic-player-bar yt-formatted-string > a";

const lyricsButtonSelector =
    '[class="tab-header style-scope ytmusic-player-page"]';
const lyricsContainerSelector =
    "#contents > ytmusic-description-shelf-renderer yt-formatted-string.non-expandable.description.style-scope.ytmusic-description-shelf-renderer";

// pear-desktop uses 15m; use 1m so background-tab timer throttling still keeps
// window._lact fresh before YT's idle check (~hours, but throttling is harsh).
const LACT_REFRESH_MS = 60 * 1000;
const DIALOG_DEBOUNCE_MS = 250;

let intentionalPause = false;
let lactTimer: ReturnType<typeof setInterval> | null = null;
let dialogObserver: MutationObserver | null = null;
let dialogDebounce: ReturnType<typeof setTimeout> | null = null;
let videoPlayBound = false;

const DIALOG_TEXT =
    /continue watching|video paused|still watching|are you (still )?there|are you there/i;
const CONFIRM_LABEL = /^(continue|yes|ok|okay|resume)$|continue watching/i;
const REJECT_LABEL = /cancel|dismiss|close|\bno\b/i;

export function getVideoId(): string | null {
    const u = document
        .querySelector('[class="ytp-title-link yt-uix-sessionlink"]')
        ?.getAttribute("href");
    if (!u) return null;
    return new URL(u).searchParams.get("v");
}

export function getPlaybackState(): {
    song: string;
    artist: string;
    state: "playing" | "paused" | "standby";
    el: HTMLVideoElement;
} {
    const el = document.querySelector(
        "#movie_player > div.html5-video-container > video",
    ) as HTMLVideoElement | null;

    const song = document.querySelector(
        "[class='title style-scope ytmusic-player-bar']",
    )?.textContent as string;

    if (el?.src) {
        return {
            song,
            artist: document.querySelector(artistSelector)
                ?.textContent as string,
            state: el.paused ? "paused" : "playing",
            el,
        };
    }
    return {
        el: el as HTMLVideoElement,
        song,
        state: "standby",
        artist: "",
    };
}

function refreshLact() {
    try {
        (window as unknown as { _lact?: number })._lact = Date.now();
    } catch {
        // ignore
    }
}

function bindVideoPlayListener() {
    if (videoPlayBound) return;
    const video = document.querySelector(
        "#movie_player > div.html5-video-container > video",
    ) as HTMLVideoElement | null;
    if (!video) return;
    video.addEventListener("play", () => {
        intentionalPause = false;
    });
    videoPlayBound = true;
}

function isVisible(el: Element): boolean {
    const node = el as HTMLElement;
    if (node.getAttribute("aria-hidden") === "true") return false;
    if (node.hasAttribute("hidden")) return false;
    const style = window.getComputedStyle(node);
    if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
    ) {
        return false;
    }
    // Prefer layout size when available; jsdom often reports 0x0 even for
    // "visible" nodes, so fall back to computed style only.
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return true;
    return style.display !== "none" && style.visibility !== "hidden";
}

function buttonLabel(el: Element): string {
    const node = el as HTMLElement;
    return (
        node.getAttribute("aria-label") ||
        node.textContent ||
        ""
    )
        .replace(/\s+/g, " ")
        .trim();
}

export function startIdleKeepAlive() {
    if (lactTimer) return;
    refreshLact();
    lactTimer = setInterval(refreshLact, LACT_REFRESH_MS);
    bindVideoPlayListener();
}

export function stopIdleKeepAlive() {
    if (lactTimer) {
        clearInterval(lactTimer);
        lactTimer = null;
    }
}

export function dismissContinueWatching(): boolean {
    bindVideoPlayListener();
    const root = document.querySelector("ytmusic-app") ?? document.body;
    const dialogs = root.querySelectorAll(
        "tp-yt-paper-dialog, yt-confirm-dialog-renderer, [role='dialog']",
    );

    for (const dialog of Array.from(dialogs)) {
        if (!isVisible(dialog)) continue;
        const text = dialog.textContent || "";
        if (!DIALOG_TEXT.test(text)) continue;

        const buttons = dialog.querySelectorAll(
            "button, tp-yt-paper-button, [role='button'], yt-button-renderer",
        );
        for (const btn of Array.from(buttons)) {
            if (!isVisible(btn)) continue;
            const label = buttonLabel(btn);
            if (!label) continue;
            if (!CONFIRM_LABEL.test(label) || REJECT_LABEL.test(label)) {
                continue;
            }
            (btn as HTMLElement).click();
            console.log("[music-party] dismissed continue-watching dialog");
            return true;
        }
    }
    return false;
}

function maybeResumeAfterDismiss() {
    if (intentionalPause) return;
    const playback = getPlaybackState();
    if (playback.state === "paused" && playback.el?.src) {
        void playback.el.play()?.catch(() => undefined);
    }
}

function onDialogMutations() {
    if (dialogDebounce) clearTimeout(dialogDebounce);
    dialogDebounce = setTimeout(() => {
        if (dismissContinueWatching()) {
            maybeResumeAfterDismiss();
        }
    }, DIALOG_DEBOUNCE_MS);
}

export function startContinueWatchingWatcher() {
    if (dialogObserver) return;
    startIdleKeepAlive();
    const target = document.querySelector("ytmusic-app") ?? document.body;
    dialogObserver = new MutationObserver(onDialogMutations);
    dialogObserver.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-hidden", "hidden", "style", "class"],
    });
    onDialogMutations();
}

export function stopContinueWatchingWatcher() {
    if (dialogDebounce) {
        clearTimeout(dialogDebounce);
        dialogDebounce = null;
    }
    dialogObserver?.disconnect();
    dialogObserver = null;
}

export function play(queue?: Queue) {
    intentionalPause = false;
    dismissContinueWatching();
    const playback = getPlaybackState();
    if (queue?.url && playback.state !== "playing") {
        window.location.href = `/watch?v=${queue.url}&qid=${queue.id}`;
    }
    if (playback.state === "paused") {
        void playback.el.play().catch(() => undefined);
        return;
    }
}

export function pause() {
    intentionalPause = true;
    const VIDEO_SELECTOR = "#movie_player > div.html5-video-container > video";
    const vid = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;
    if (vid) {
        vid.pause();
    }
}

export function volumeUp(): number {
    const event = new KeyboardEvent("keydown", { key: "=" });
    document.dispatchEvent(event);

    // get current volume
    const video = document.querySelector(
        "#movie_player > div.html5-video-container > video",
    ) as HTMLVideoElement;

    if (video) {
        return video.volume * 100;
    }

    return 0;
}

export function volumeDown(): number {
    const event = new KeyboardEvent("keydown", { key: "-" });
    document.dispatchEvent(event);

    // get current volume
    const video = document.querySelector(
        "#movie_player > div.html5-video-container > video",
    ) as HTMLVideoElement;

    if (video) {
        return video.volume * 100;
    }

    return 0;
}

export function toggleMute() {
    const VIDEO_SELECTOR = ".volume";

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

export function lyrics() {
    const lyricsButton = document.querySelector(
        lyricsButtonSelector,
    ) as HTMLButtonElement;

    if (lyricsButton) {
        lyricsButton.click();
    }

    return new Promise((resolve) => {
        setTimeout(() => {
            const text = document.querySelector(
                lyricsContainerSelector,
            )?.textContent;

            if (lyricsButton.getAttribute("aria-disabled") === "true") {
                resolve(null);
            }

            resolve(text);
        }, 1000);
    });
}

export function next(queue?: Queue) {
    intentionalPause = false;
    dismissContinueWatching();
    if (queue?.url) {
        window.location.href = `/watch?v=${queue.url}&qid=${queue.id}`;
    }

    const NEXT_SELECTOR = ".next-button";

    const el = document.querySelector(NEXT_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

export function prev() {
    intentionalPause = false;
    dismissContinueWatching();
    const PREV_SELECTOR = ".previous-button";

    const el = document.querySelector(PREV_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

export function resume() {
    intentionalPause = false;
    dismissContinueWatching();
    const el =
        (document.querySelector(
            "#play-pause-button",
        ) as HTMLButtonElement | null) ||
        (document.querySelector(
            ".play-pause-button",
        ) as HTMLButtonElement | null) ||
        (document.querySelector(
            "tp-yt-paper-icon-button.play-pause-button",
        ) as HTMLButtonElement | null);

    if (el) {
        el.click();
        return;
    }

    const playback = getPlaybackState();
    if (playback.state === "paused" && playback.el?.src) {
        void playback.el.play().catch(() => undefined);
    }
}
