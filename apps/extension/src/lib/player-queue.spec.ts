import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePlayerQueue, readPlayerQueue, watchPlayerQueue, splitQueue } from "./player-queue";

const track = (id: string, selected = false) => ({
    playlistPanelVideoRenderer: {
        videoId: id,
        title: { runs: [{ text: "Song - title" }] },
        shortBylineText: { simpleText: "Artist" },
        selected,
    },
});

afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
});

describe("player queue", () => {
    it("reads autoplay from queue.automixItems, not unrelated rendered rows", () => {
        const queue = document.createElement("ytmusic-player-queue");
        queue.id = "queue";
        Object.assign(queue, { queue: { store: { store: {
            getState: () => ({ queue: {
                items: [track("current", true)],
                autoplay: true,
                automixItems: [track("autoplay1"), track("autoplay2")],
            } }),
        } } } });
        for (const id of ["unrelated"]) {
            const row = document.createElement("ytmusic-playlist-panel-video-renderer");
            Object.assign(row, { data: track(id, id === "current").playlistPanelVideoRenderer });
            queue.appendChild(row);
        }
        document.body.appendChild(queue);
        const snapshot = readPlayerQueue();
        expect(snapshot.items.map((item) => item.url)).toEqual(["current", "autoplay1", "autoplay2"]);
        expect(splitQueue(snapshot.items, []).autoplay.map((item) => item.url))
            .toEqual(["autoplay1", "autoplay2"]);
    });

    it("does not guess queue entries from rendered links", () => {
        document.body.innerHTML = `<ytmusic-player-queue id="queue">
            <ytmusic-player-queue-item><ytmusic-playlist-panel-video-renderer>
                <a href="https://music.youtube.com/watch?v=auto"></a>
                <span id="video-title">Autoplay song</span><span id="byline">Artist</span>
            </ytmusic-playlist-panel-video-renderer></ytmusic-player-queue-item>
        </ytmusic-player-queue>`;
        expect(readPlayerQueue()).toEqual({ available: false, items: [] });
    });

    it("ignores prefetched automix when autoplay is disabled and uses the selected index", () => {
        const queue = document.createElement("div");
        queue.id = "queue";
        Object.assign(queue, { queue: { store: { store: {
            getState: () => ({ queue: {
                items: [track("history"), track("current"), track("manual")],
                selectedItemIndex: 1,
                autoplay: false,
                automixItems: [track("prefetched")],
            } }),
        } } } });
        document.body.appendChild(queue);
        const snapshot = readPlayerQueue();
        expect(snapshot.items.map((item) => item.url)).toEqual(["history", "current", "manual"]);
        expect(snapshot.items[1].current).toBe(true);
        expect(splitQueue(snapshot.items, []).autoplay.map((item) => item.url)).toEqual(["manual"]);
    });
    it("separates requests, excludes history/current, and previews only five player tracks", () => {
        const items = parsePlayerQueue([
            track("history"), track("current", true), track("request"),
            ...Array.from({ length: 8 }, (_, index) => track(`auto${index}`)),
        ]);
        const result = splitQueue(items, [
            { id: "r", url: "request" }, { id: "p", url: "pending", title: "Pending" },
        ]);
        expect(result.user.map((item) => item.url)).toEqual(["request", "pending"]);
        expect(result.autoplay.map((item) => item.url)).toEqual(["auto0", "auto1", "auto2", "auto3", "auto4"]);
        expect(result.hiddenAutoplay).toBe(3);
    });
    it("preserves order, duplicates, metadata and current selection", () => {
        const items = parsePlayerQueue([track("a"), track("b", true), track("a")]);
        expect(items.map((item) => item.url)).toEqual(["a", "b", "a"]);
        expect(new Set(items.map((item) => item.id)).size).toBe(3);
        expect(items[1]).toMatchObject({ title: "Song - title", artist: "Artist", current: true });
    });

    it("handles wrappers and skips non-track entries", () => {
        expect(parsePlayerQueue([{}, { content: {
            playlistPanelVideoWrapperRenderer: { primaryRenderer: track("a") },
        } }])).toHaveLength(1);
    });

    it("distinguishes unavailable from an empty store", () => {
        expect(readPlayerQueue()).toEqual({ available: false, items: [] });
        const el = document.createElement("div");
        el.id = "queue";
        Object.assign(el, { queue: { store: { store: { getState: () => ({ queue: { items: [] } }) } } } });
        document.body.appendChild(el);
        expect(readPlayerQueue()).toEqual({ available: true, items: [] });
    });

    it("handles late stores, coalesces changes, and cleans up subscriptions", () => {
        vi.useFakeTimers();
        const onChange = vi.fn();
        const stop = watchPlayerQueue(onChange);
        let listener = () => {};
        const unsubscribe = vi.fn();
        let items = [track("a")];
        const el = document.createElement("div");
        el.id = "queue";
        Object.assign(el, { queue: { store: { store: {
            getState: () => ({ queue: { items } }),
            subscribe: (fn: () => void) => { listener = fn; return unsubscribe; },
        } } } });
        document.body.appendChild(el);
        vi.advanceTimersByTime(1000);
        expect(onChange).toHaveBeenCalledTimes(2);
        items = [track("b")];
        listener();
        listener();
        vi.advanceTimersByTime(50);
        expect(onChange).toHaveBeenCalledTimes(3);
        vi.advanceTimersByTime(1000);
        expect(onChange).toHaveBeenCalledTimes(3);
        stop();
        expect(unsubscribe).toHaveBeenCalledOnce();
    });
});
