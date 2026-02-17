export type Queue = { id: string; url: string };

const artistSelector =
    "div.content-info-wrapper.style-scope.ytmusic-player-bar > span > .subtitle.style-scope.ytmusic-player-bar yt-formatted-string > a";

const lyricsButtonSelector =
    '[class="tab-header style-scope ytmusic-player-page"]';
const lyricsContainerSelector =
    "#contents > ytmusic-description-shelf-renderer yt-formatted-string.non-expandable.description.style-scope.ytmusic-description-shelf-renderer";

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
    ) as HTMLVideoElement;

    const song = document.querySelector(
        "[class='title style-scope ytmusic-player-bar']",
    )?.textContent as string;

    if (el.src) {
        return {
            song,
            artist: document.querySelector(artistSelector)
                ?.textContent as string,
            state: el.paused ? "paused" : "playing",
            el,
        };
    }
    return {
        el,
        song,
        state: "standby",
        artist: "",
    };
}

export function play(queue?: Queue) {
    const playback = getPlaybackState();
    if (queue?.url && playback.state !== "playing") {
        window.location.href = `/watch?v=${queue.url}&qid=${queue.id}`;
    }
    if (playback.state === "paused") {
        playback.el.play();
        return;
    }
}

export function pause() {
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
    const PREV_SELECTOR = ".previous-button";

    const el = document.querySelector(PREV_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

export function resume() {
    const VIDEO_SELECTOR = "play-pause-button";

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}
