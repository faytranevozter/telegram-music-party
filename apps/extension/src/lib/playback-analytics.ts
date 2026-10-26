import type { Socket } from "socket.io-client";
import { getPlaybackState, getVideoId } from "./playback";

/**
 * Playback analytics reported to the party backend. Reports originate from the
 * MAIN-world content script and are accepted only while this browser is the
 * admitted device for the room.
 *
 * Time is observed from the <video> element: paused time and seek jumps never
 * count, while normal playback continues to accumulate in background tabs even
 * when timers are throttled.
 */

const TICK_MS = 1000;
const CHECKPOINT_MS = 30_000;

type PlaybackReportSource = "requested" | "autoplay" | "manual" | "unknown";
type PlaybackEndReason =
    | "completed"
    | "skipped"
    | "interrupted"
    | "unknown";
type PlaybackReportEvent = "start" | "progress" | "end";

export type PlaybackReport = {
    roomId: string;
    playbackId: string;
    videoId: string;
    requestId?: string;
    title: string;
    artist: string;
    durationMs?: number;
    source: PlaybackReportSource;
    event: PlaybackReportEvent;
    startedAt: string;
    endedAt?: string;
    listenedMs: number;
    endReason?: PlaybackEndReason;
};

type ActiveSession = {
    playbackId: string;
    videoId: string;
    startedAt: number;
    requestId: string | null;
    source: PlaybackReportSource;
    title: string;
    artist: string;
    durationMs: number | null;
    maxPositionMs: number;
    lastReportAt: number;
    tracker: PlaybackTimeTracker;
};

type VideoWithFlag = HTMLVideoElement & { __ytmpAnalyticsBound?: boolean };

/**
 * Accumulates observed playing seconds. A delta is only counted when it is
 * consistent with wall-clock time, which rejects seeks before they are even
 * reported by the `seeked` event.
 */
export class PlaybackTimeTracker {
    listenedMs = 0;
    private lastTime: number | null = null;
    private lastAt: number | null = null;

    observe(currentTime: number, paused: boolean, now = Date.now()) {
        if (!Number.isFinite(currentTime)) return;

        if (paused) {
            this.lastTime = currentTime;
            this.lastAt = now;
            return;
        }

        if (this.lastTime !== null && this.lastAt !== null) {
            const elapsedSeconds = Math.max(0, (now - this.lastAt) / 1000);
            const delta = currentTime - this.lastTime;
            // Forward seek (delta too large) and rewind (delta <= 0) are ignored.
            if (delta > 0 && delta <= elapsedSeconds + 2) {
                this.listenedMs += delta * 1000;
            }
        }

        this.lastTime = currentTime;
        this.lastAt = now;
    }

    /** Forget the previous position so the next observation cannot add time. */
    seek() {
        this.lastTime = null;
        this.lastAt = null;
    }
}

let pendingSkip = false;

/** Mark the next track change as an intentional skip (bot / player buttons). */
export function noteSkipIntent() {
    pendingSkip = true;
}

function consumeSkipIntent() {
    const value = pendingSkip;
    pendingSkip = false;
    return value;
}

function safePlaylistId(): string | null {
    try {
        return new URL(window.location.href).searchParams.get("list");
    } catch {
        return null;
    }
}

function resolveSource(
    requestId: string | null,
): PlaybackReportSource {
    if (requestId) return "requested";
    const list = safePlaylistId();
    if (list?.startsWith("RD")) return "autoplay";
    return list ? "manual" : "unknown";
}

function randomPlaybackId() {
    try {
        return crypto.randomUUID();
    } catch {
        return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
}

function videoElement(): HTMLVideoElement | null {
    return document.querySelector(
        "#movie_player > div.html5-video-container > video",
    ) as HTMLVideoElement | null;
}

export type PlaybackAnalyticsOptions = {
    socket: Socket;
    getRoomId: () => string | null;
    /** Durable request ID for a video, when this device knows one. */
    getRequestId: (videoId: string) => string | null;
};

/**
 * Start reporting. Returns a cleanup function for tests and reloads.
 */
export function startPlaybackAnalytics(
    options: PlaybackAnalyticsOptions,
): () => void {
    const { socket, getRoomId, getRequestId } = options;
    let session: ActiveSession | null = null;
    let stopped = false;

    const emit = (
        event: PlaybackReportEvent,
        endReason?: PlaybackEndReason,
        endedAt = Date.now(),
    ) => {
        if (!session) return;
        const roomId = getRoomId();
        if (!roomId || !socket.connected) return;

        const report: PlaybackReport = {
            roomId,
            playbackId: session.playbackId,
            videoId: session.videoId,
            ...(session.requestId ? { requestId: session.requestId } : {}),
            title: session.title,
            artist: session.artist,
            ...(session.durationMs
                ? { durationMs: Math.round(session.durationMs) }
                : {}),
            source: session.source,
            event,
            startedAt: new Date(session.startedAt).toISOString(),
            ...(event === "end"
                ? {
                      endedAt: new Date(endedAt).toISOString(),
                      endReason: endReason ?? "unknown",
                  }
                : {}),
            listenedMs: Math.round(session.tracker.listenedMs),
        };

        socket.emit("playback-report", report);
        session.lastReportAt = Date.now();
    };

    const endSession = (
        reason: PlaybackEndReason,
        endedAt = Date.now(),
    ) => {
        if (!session) return;
        emit("end", reason, endedAt);
        session = null;
        pendingSkip = false;
    };

    const startSession = (
        videoId: string,
        playback: ReturnType<typeof getPlaybackState>,
    ) => {
        const requestId = getRequestId(videoId);
        const now = Date.now();
        session = {
            playbackId: randomPlaybackId(),
            videoId,
            startedAt: now,
            requestId,
            source: resolveSource(requestId),
            title: (playback.song || "").trim(),
            artist: (playback.artist || "").trim(),
            durationMs:
                playback.el && Number.isFinite(playback.el.duration)
                    ? playback.el.duration * 1000
                    : null,
            maxPositionMs: 0,
            lastReportAt: now,
            tracker: new PlaybackTimeTracker(),
        };
        emit("start");
    };

    const refreshMetadata = (
        playback: ReturnType<typeof getPlaybackState>,
    ) => {
        if (!session) return;
        const title = (playback.song || "").trim();
        const artist = (playback.artist || "").trim();
        if (title) session.title = title;
        if (artist) session.artist = artist;
        if (
            playback.el &&
            Number.isFinite(playback.el.duration) &&
            playback.el.duration > 0
        ) {
            session.durationMs = playback.el.duration * 1000;
        }
        if (!session.requestId) {
            const requestId = getRequestId(session.videoId);
            if (requestId) {
                session.requestId = requestId;
                session.source = "requested";
            }
        }
    };

    const bindVideoEvents = () => {
        const video = videoElement() as VideoWithFlag | null;
        if (!video || video.__ytmpAnalyticsBound) return;
        video.__ytmpAnalyticsBound = true;
        video.addEventListener("seeked", () => {
            session?.tracker.seek();
        });
        video.addEventListener("ended", () => {
            if (session) endSession("completed");
        });
    };

    const onDocumentClick = (event: MouseEvent) => {
        const target = event.target as Element | null;
        if (target?.closest?.(".next-button, .previous-button")) {
            noteSkipIntent();
        }
    };

    const tick = () => {
        if (stopped) return;
        bindVideoEvents();

        const playback = getPlaybackState();
        const videoId = getVideoId();
        const video = playback.el;

        if (!videoId || playback.state === "standby") {
            if (session) endSession("interrupted");
            return;
        }

        if (!session || session.videoId !== videoId) {
            if (session) {
                endSession(
                    consumeSkipIntent() ? "skipped" : "interrupted",
                );
            } else {
                consumeSkipIntent();
            }
            // A session starts only once the player confirms playback. A
            // restored but paused tab waits for the first play.
            if (playback.state !== "playing") return;
            startSession(videoId, playback);
        }

        if (!session) return;

        // The session variable is re-read after startSession for TS narrowing.
        const active: ActiveSession = session;
        refreshMetadata(playback);

        const now = Date.now();
        const paused = playback.state !== "playing";

        // A rewind to the start after real progress is a genuine repeat, not a
        // seek within the same playback: end the old session and start a new
        // playback ID so repeated plays are counted separately.
        if (
            video &&
            Number.isFinite(video.currentTime) &&
            active.maxPositionMs >= 30_000 &&
            video.currentTime * 1000 <= 5_000
        ) {
            endSession("skipped");
            startSession(videoId, playback);
            return;
        }

        if (video && Number.isFinite(video.currentTime)) {
            active.tracker.observe(video.currentTime, paused, now);
            active.maxPositionMs = Math.max(
                active.maxPositionMs,
                video.currentTime * 1000,
            );
        }

        if (now - active.lastReportAt >= CHECKPOINT_MS) {
            // Checkpoints continue while paused so the server knows the tab is
            // still alive; listened time simply does not advance.
            emit("progress");
        }
    };

    const onPageHide = () => {
        if (!session) return;
        // A queue navigation marked as a skip ends the old track as skipped;
        // closing the tab otherwise cannot establish an end.
        emit("end", pendingSkip ? "skipped" : "interrupted");
    };

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("pagehide", onPageHide);
    // Admission happens after the socket connects. Resend the current session
    // once the room accepts this device, otherwise an early start (or a
    // reconnect checkpoint) can be lost while reports are rejected.
    const onJoined = () => {
        if (session) emit("progress");
    };
    socket.on("joined", onJoined);
    bindVideoEvents();
    const timer = setInterval(tick, TICK_MS);

    return () => {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener("click", onDocumentClick, true);
        window.removeEventListener("pagehide", onPageHide);
        socket.off("joined", onJoined);
        if (session) emit("end", "interrupted");
        session = null;
    };
}
