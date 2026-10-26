import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const playbackMock = vi.hoisted(() => ({
    song: "Song",
    artist: "Artist",
    state: "playing" as "playing" | "paused" | "standby",
    videoId: "video-1" as string | null,
    el: null as unknown as HTMLVideoElement,
}));

vi.mock("./playback", () => ({
    getPlaybackState: () => ({
        song: playbackMock.song,
        artist: playbackMock.artist,
        state: playbackMock.state,
        el: playbackMock.el,
    }),
    getVideoId: () => playbackMock.videoId,
}));

import {
    noteSkipIntent,
    PlaybackTimeTracker,
    startPlaybackAnalytics,
} from "./playback-analytics";

function mountVideo() {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    container.id = "movie_player";
    container.innerHTML = `<div class="html5-video-container"><video></video></div>`;
    document.body.appendChild(container);

    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", {
        configurable: true,
        value: 200,
    });
    Object.defineProperty(video, "currentTime", {
        configurable: true,
        writable: true,
        value: 0,
    });
    playbackMock.el = video;
    return video;
}

function makeSocket() {
    const listeners = new Map<string, Array<() => void>>();
    const on = vi.fn((event: string, handler: () => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), handler]);
    });
    return {
        connected: true,
        emit: vi.fn(),
        on,
        off: vi.fn(),
        trigger(event: string) {
            listeners.get(event)?.forEach((handler) => handler());
        },
    };
}

describe("PlaybackTimeTracker", () => {
    it("counts normal playback and ignores forward and backward seeks", () => {
        const tracker = new PlaybackTimeTracker();
        tracker.observe(0, false, 0);
        tracker.observe(1, false, 1000);
        tracker.observe(2, false, 2000);
        expect(tracker.listenedMs).toBe(2000);

        // Forward seek: 60 seconds in one tick is not listening time.
        tracker.observe(62, false, 3000);
        expect(tracker.listenedMs).toBe(2000);

        // Playback continues after the seek.
        tracker.observe(63, false, 4000);
        expect(tracker.listenedMs).toBe(3000);

        // Rewind is ignored.
        tracker.observe(10, false, 5000);
        expect(tracker.listenedMs).toBe(3000);
    });

    it("does not count paused time and keeps the session on resume", () => {
        const tracker = new PlaybackTimeTracker();
        tracker.observe(10, false, 0);
        tracker.observe(11, false, 1000);

        tracker.observe(11, true, 2000);
        tracker.observe(11, true, 60_000);

        tracker.observe(12, false, 61_000);
        expect(tracker.listenedMs).toBe(2000);
    });

    it("still counts background playback when timers are throttled", () => {
        const tracker = new PlaybackTimeTracker();
        tracker.observe(0, false, 0);
        // A 60s throttle gap with 60s of real playback is not a seek.
        tracker.observe(60, false, 60_000);
        expect(tracker.listenedMs).toBe(60_000);
    });
});

describe("startPlaybackAnalytics", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-26T10:00:00Z"));
        playbackMock.song = "Song";
        playbackMock.artist = "Artist";
        playbackMock.state = "playing";
        playbackMock.videoId = "video-1";
        mountVideo();
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
        window.history.replaceState({}, "", "/");
    });

    it.each([
        ["/watch?v=video-1&list=RDAMVMvideo-1", "autoplay"],
        ["/watch?v=video-1&list=PL123", "manual"],
        ["/watch?v=video-1", "unknown"],
    ])(
        "classifies %s playback as %s",
        (url, expectedSource) => {
            window.history.replaceState({}, "", url);
            const socket = makeSocket();
            startPlaybackAnalytics({
                socket: socket as never,
                getRoomId: () => "room-1",
                getRequestId: () => null,
            });

            vi.advanceTimersByTime(1000);

            expect(socket.emit).toHaveBeenCalledWith(
                "playback-report",
                expect.objectContaining({
                    event: "start",
                    source: expectedSource,
                }),
            );
        },
    );

    it("reports a start, checkpoint progress, and a completed end", () => {
        const socket = makeSocket();
        startPlaybackAnalytics({
            socket: socket as never,
            getRoomId: () => "room-1",
            getRequestId: () => null,
        });

        vi.advanceTimersByTime(1000);
        expect(socket.emit).toHaveBeenCalledWith(
            "playback-report",
            expect.objectContaining({
                event: "start",
                roomId: "room-1",
                playbackId: expect.any(String),
                videoId: "video-1",
                source: "unknown",
            }),
        );

        const video = playbackMock.el;
        video.currentTime = 1;
        vi.advanceTimersByTime(1000);
        video.currentTime = 2;
        vi.advanceTimersByTime(1000);

        vi.advanceTimersByTime(28_000);
        const progress = socket.emit.mock.calls.find(
            ([, report]) => report.event === "progress",
        );
        expect(progress).toBeTruthy();
        expect(progress?.[1].listenedMs).toBeGreaterThanOrEqual(1000);

        video.dispatchEvent(new Event("ended"));
        const end = socket.emit.mock.calls.find(
            ([, report]) => report.event === "end",
        );
        expect(end?.[1]).toEqual(
            expect.objectContaining({
                event: "end",
                endReason: "completed",
            }),
        );
    });

    it("marks an intentional track change as skipped", () => {
        const socket = makeSocket();
        startPlaybackAnalytics({
            socket: socket as never,
            getRoomId: () => "room-1",
            getRequestId: () => null,
        });

        vi.advanceTimersByTime(1000);
        noteSkipIntent();
        playbackMock.videoId = "video-2";
        playbackMock.song = "Next song";
        vi.advanceTimersByTime(1000);

        const reports = socket.emit.mock.calls.map(([, report]) => report);
        expect(
            reports.filter((report) => report.event === "end")[0],
        ).toEqual(
            expect.objectContaining({
                videoId: "video-1",
                endReason: "skipped",
            }),
        );
        expect(
            reports.filter((report) => report.event === "start").length,
        ).toBe(2);
    });

    it("starts a new playback when a track is replayed from the beginning", () => {
        const socket = makeSocket();
        startPlaybackAnalytics({
            socket: socket as never,
            getRoomId: () => "room-1",
            getRequestId: () => null,
        });

        vi.advanceTimersByTime(1000);
        const video = playbackMock.el;
        // Listen well past 30 seconds of the track, then jump back to 0.
        video.currentTime = 60;
        vi.advanceTimersByTime(1000);
        video.currentTime = 0;
        vi.advanceTimersByTime(1000);

        const reports = socket.emit.mock.calls.map(([, report]) => report);
        expect(
            reports.filter((report) => report.event === "end")[0],
        ).toEqual(
            expect.objectContaining({
                endReason: "skipped",
            }),
        );
        expect(
            reports.filter((report) => report.event === "start").length,
        ).toBe(2);
    });

    it("resends the current session when the room admits the device", () => {
        const socket = makeSocket();
        startPlaybackAnalytics({
            socket: socket as never,
            getRoomId: () => "room-1",
            getRequestId: () => null,
        });

        vi.advanceTimersByTime(1000);
        socket.emit.mockClear();
        socket.trigger("joined");

        expect(socket.emit).toHaveBeenCalledWith(
            "playback-report",
            expect.objectContaining({
                event: "progress",
                roomId: "room-1",
            }),
        );
    });

    it("uses the request ID as requested attribution", () => {
        const socket = makeSocket();
        startPlaybackAnalytics({
            socket: socket as never,
            getRoomId: () => "room-1",
            getRequestId: (videoId) =>
                videoId === "video-1" ? "request-1" : null,
        });

        vi.advanceTimersByTime(1000);
        expect(socket.emit).toHaveBeenCalledWith(
            "playback-report",
            expect.objectContaining({
                event: "start",
                requestId: "request-1",
                source: "requested",
            }),
        );
    });
});
