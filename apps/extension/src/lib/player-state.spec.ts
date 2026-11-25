// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayerStateChannel, watchPlayerState } from "./player-state";

const watchers: ReturnType<typeof watchPlayerState>[] = [];

function mountVideo(paused = false) {
    document.body.innerHTML = '<div id="movie_player"><div class="html5-video-container"><video src="https://example.com/track"></video></div></div>';
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "paused", { value: paused, writable: true });
    return video;
}

function emit(video: HTMLVideoElement, event: string, paused?: boolean) {
    if (paused !== undefined) Object.defineProperty(video, "paused", { value: paused });
    video.dispatchEvent(new Event(event));
}

function observe() {
    const report = vi.fn();
    const watcher = watchPlayerState(report);
    watchers.push(watcher);
    watcher.sync();
    return report;
}

afterEach(() => {
    watchers.splice(0).forEach(({ stop }) => stop());
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
    vi.useRealTimers();
});

describe("watchPlayerState", () => {
    it("reports an ad starting and ending without a media event", async () => {
        const player = mountVideo().closest("#movie_player")!;
        const report = observe();
        player.classList.add("ad-showing");
        await Promise.resolve();
        expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ adPlaying: true }));
        player.classList.remove("ad-showing");
        await Promise.resolve();
        expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ adPlaying: false }));
    });

    it("detects a same-URL radio queue and clears it for autoplay with added requests", () => {
        vi.useFakeTimers();
        mountVideo();
        history.replaceState(null, "", "/watch?v=abcdefghijk");
        const queue = document.createElement("div");
        queue.id = "queue";
        const state = { isInfinite: false, autoplay: true, items: [{}, {}], automixItems: [{}] };
        Object.assign(queue, { queue: { store: { store: { getState: () => ({ queue: state }) } } } });
        document.body.append(queue);
        const report = observe();
        expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ mix: false }));
        state.isInfinite = true;
        vi.advanceTimersByTime(1000);
        expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ mix: true }));
        state.isInfinite = false;
        vi.advanceTimersByTime(1000);
        expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ mix: false }));
    });

    it("reports entering and leaving a mix without needing a media event", () => {
        vi.useFakeTimers();
        mountVideo();
        history.replaceState(null, "", "/watch?v=abcdefghijk&list=RDAMVMabcdefghijk");
        const report = observe();
        expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ mix: true }));
        history.replaceState(null, "", "/watch?v=abcdefghijk");
        vi.advanceTimersByTime(1000);
        expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ mix: false }));
    });

    it("reports native play and pause once each, and treats end as standby", () => {
        vi.useFakeTimers();
        const video = mountVideo();
        const report = observe();
        emit(video, "pause", true);
        emit(video, "pause", true);
        vi.runOnlyPendingTimers();
        emit(video, "play", false);
        Object.defineProperty(video, "ended", { value: true });
        emit(video, "pause", true);
        emit(video, "ended");
        expect(report.mock.calls.map(([snapshot]) => snapshot.state)).toEqual([
            "playing", "paused", "playing", "standby",
        ]);
    });

    it("reads late and replacement videos, but ignores events from old videos", () => {
        const report = observe();
        const first = mountVideo();
        emit(first, "loadedmetadata");
        const second = mountVideo();
        emit(second, "pause", true);
        emit(first, "play", false);
        expect(report.mock.calls.map(([snapshot]) => snapshot.state)).toEqual([
            "standby", "playing", "standby", "paused",
        ]);
    });

    it("reports a replacement even if it emits no media event", async () => {
        vi.useFakeTimers();
        const first = mountVideo();
        const report = observe();
        first.volume = 0.5;
        emit(first, "volumechange");
        const second = mountVideo(true);
        second.volume = 0.7;
        await Promise.resolve();
        expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ state: "paused", volume: 70 }));
        vi.runOnlyPendingTimers();
        expect(report).toHaveBeenCalledTimes(3);
    });

    it("does not report an outgoing pause when the source is immediately emptied", () => {
        vi.useFakeTimers();
        const video = mountVideo();
        const report = observe();
        emit(video, "pause", true);
        emit(video, "emptied");
        vi.runOnlyPendingTimers();
        expect(report.mock.calls.map(([snapshot]) => snapshot.state)).toEqual(["playing", "standby"]);
    });

    it("coalesces slider changes and reports the confirmed mute state", () => {
        vi.useFakeTimers();
        const video = mountVideo();
        video.volume = 0.25;
        const report = observe();
        video.volume = 0.5;
        emit(video, "volumechange");
        video.volume = 0.7;
        video.muted = true;
        emit(video, "volumechange");
        expect(report).toHaveBeenCalledTimes(1);
        vi.runOnlyPendingTimers();
        expect(report.mock.calls.map(([snapshot]) => [snapshot.volume, snapshot.muted])).toEqual([
            [25, false], [70, true],
        ]);
    });
});

it("uses exactly one reporting path for old and new servers", () => {
    const report = vi.fn();
    const legacy = vi.fn();
    const channel = createPlayerStateChannel(report);
    channel.legacy(legacy);
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
    channel.join({ playerState: true });
    channel.legacy(legacy);
    expect(report).toHaveBeenCalledTimes(1);
    expect(legacy).toHaveBeenCalledTimes(1);
    channel.join();
    channel.legacy(legacy);
    expect(legacy).toHaveBeenCalledTimes(2);
});
