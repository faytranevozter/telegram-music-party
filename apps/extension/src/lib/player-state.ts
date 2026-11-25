import { getPlaybackState, getVideoId } from "./playback";
import { readMixQueue } from "./player-queue";

export type PlayerState = {
    state: "playing" | "paused" | "standby";
    videoId: string | null;
    song: string;
    artist: string;
    volume: number | null;
    muted: boolean | null;
    mix: boolean;
    adPlaying: boolean;
};

const isAdPlaying = () => document.querySelector("#movie_player.ad-showing") !== null;

function isMix() {
    // Autoplay can also put an RD playlist in the URL when it advances.
    return readMixQueue() ?? (new URL(window.location.href).searchParams.get("list")?.startsWith("RD") === true);
}

const events = ["play", "pause", "ended", "emptied", "loadedmetadata", "volumechange"];
const volumeSettleMs = 300;

export function createPlayerStateChannel(sync: () => void) {
    let supported = false;
    return {
        get supported() { return supported; },
        join(capabilities?: { playerState?: boolean }) {
            supported = capabilities?.playerState === true;
            if (supported) sync();
        },
        legacy(notify: () => void) {
            if (!supported) notify();
        },
    };
}

export function watchPlayerState(report: (state: PlayerState) => void) {
    let previous: PlayerState | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;
    let activeVideo = getPlaybackState().el;
    let activeSource = activeVideo?.currentSrc || activeVideo?.src;

    const sample = (empty = false) => {
        const { el, state, song, artist } = getPlaybackState();
        const active = !empty && !el?.ended && state !== "standby";
        const next: PlayerState = {
            state: active ? state : "standby",
            videoId: active ? getVideoId() : null,
            song: active ? (song ?? "") : "",
            artist: active ? (artist ?? "") : "",
            volume: timer !== undefined && previous ? previous.volume : el ? Math.round(el.volume * 100) : null,
            muted: timer !== undefined && previous ? previous.muted : (el?.muted ?? null),
            mix: isMix(),
            adPlaying: isAdPlaying(),
        };
        if (previous && Object.keys(next).every((key) => {
            const field = key as keyof PlayerState;
            return previous?.[field] === next[field];
        })) return;
        previous = next;
        report(next);
    };

    const cancelVolume = () => {
        clearTimeout(timer);
        timer = undefined;
    };

    const cancelPause = () => {
        clearTimeout(pauseTimer);
        pauseTimer = undefined;
    };

    const reconcileVideo = (video: HTMLVideoElement) => {
        const source = video?.currentSrc || video?.src;
        if (activeVideo === video && activeSource === source) return;
        activeVideo = video;
        activeSource = source;
        cancelVolume();
        cancelPause();
        // Don't compare play/pause across different media elements.
        if (previous && previous.state !== "standby") sample(true);
        sample();
    };

    const onMediaEvent = (event: Event) => {
        const { el } = getPlaybackState();
        if (event.target !== el) return;
        reconcileVideo(el);
        if (event.type === "volumechange") {
            cancelVolume();
            timer = setTimeout(() => {
                timer = undefined;
                if (pauseTimer === undefined) sample();
            }, volumeSettleMs);
            return;
        }
        cancelPause();
        if (event.type === "pause" && !el.ended) {
            // Loading a new track can pause the outgoing source before its
            // emptied/metadata events or the page's track ID catch up.
            pauseTimer = setTimeout(() => {
                pauseTimer = undefined;
                reconcileVideo(getPlaybackState().el);
                sample();
            }, 100);
            return;
        }
        sample(event.type === "emptied" || event.type === "ended");
    };

    for (const event of events) document.addEventListener(event, onMediaEvent, true);
    const observer = new MutationObserver(() => {
        reconcileVideo(getPlaybackState().el);
        if (previous && previous.adPlaying !== isAdPlaying()) sample();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "class"] });
    // Same-track SPA navigation can change the playlist without a media event.
    const playlistTimer = setInterval(() => {
        if (previous && previous.mix !== isMix()) sample();
    }, 1000);
    return {
        update: () => sample(),
        sync() {
            cancelVolume();
            cancelPause();
            activeVideo = getPlaybackState().el;
            activeSource = activeVideo?.currentSrc || activeVideo?.src;
            previous = undefined;
            sample();
        },
        stop() {
            clearInterval(playlistTimer);
            cancelVolume();
            cancelPause();
            observer.disconnect();
            for (const event of events) document.removeEventListener(event, onMediaEvent, true);
        },
    };
}
