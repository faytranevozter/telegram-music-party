import { afterEach, describe, expect, it, vi } from "vitest";
import {
    queueInsertableContent,
    parsePlayerQueue,
    playerQueueIndex,
    queueInsertIndex,
    readPlayerQueue,
    splitQueue,
    upcomingVideoIds,
    waitForQueueItem,
    watchPlayerQueue,
} from "./player-queue";

const track = (id: string, selected = false) => ({
    playlistPanelVideoRenderer: {
        videoId: id,
        title: { runs: [{ text: "Song - title" }] },
        shortBylineText: { simpleText: "Artist" },
        selected,
    },
});

const blockedGoodLife = {
    playlistPanelVideoRenderer: {
        videoId: "M2VSZYdDkKc",
        navigationEndpoint: { watchEndpoint: { videoId: "M2VSZYdDkKc" } },
        unplayableText: { runs: [{ text: "[Video blocked in country]" }] },
    },
};

afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
});

describe("player queue", () => {
    it("rejects an explicitly blocked response before inserting it, without rejecting a titleless track", () => {
        const titleless = { playlistPanelVideoRenderer: { videoId: "titleless01" } };
        const playable = track("oND0Huaw5Fc");
        expect(queueInsertableContent([
            { content: blockedGoodLife }, { content: playable }, { content: titleless }, {},
        ])).toEqual({ items: [playable, titleless], refusedIds: ["M2VSZYdDkKc"] });
    });

    it("does not count a previously inserted blocked placeholder as an accepted track", async () => {
        const queue = document.createElement("div");
        queue.id = "queue";
        Object.assign(queue, { queue: { store: { store: {
            getState: () => ({ queue: { items: [track("current", true), blockedGoodLife] } }),
        } } } });
        document.body.append(queue);
        expect(readPlayerQueue().items.map((item) => item.url)).toEqual(["current"]);
        await expect(waitForQueueItem("M2VSZYdDkKc", 0)).resolves.toBe("missing");
    });

    it("reads known track lengths without guessing missing or malformed ones", () => {
        const item = (lengthText: unknown) => ({ ...track("song").playlistPanelVideoRenderer, lengthText });
        expect(parsePlayerQueue([item({ simpleText: "4:52" }), item({ runs: [{ text: "1:02:03" }] }), item("1:99"), item(undefined)]).map((entry) => entry.durationSeconds)).toEqual([292, 3723, undefined, undefined]);
    });
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

    it("waits for a track the player accepted", async () => {
        let items = [{ id: "0:other", url: "other", title: "", artist: "", current: false }];
        const read = () => ({ available: true, items });
        setTimeout(() => {
            items = [
                ...items,
                { id: "1:wanted", url: "wanted", title: "", artist: "", current: false },
            ];
        }, 10);

        await expect(waitForQueueItem("wanted", 500, read)).resolves.toBe("added");
    });

    it("reports a track the player never queued", async () => {
        const read = () => ({ available: true, items: [] });

        await expect(waitForQueueItem("refused", 200, read)).resolves.toBe("missing");
    });

    it("stays undecided when the queue store is unreadable", async () => {
        const read = () => ({ available: false, items: [] });

        await expect(waitForQueueItem("refused", 200, read)).resolves.toBe("unknown");
    });
});

describe("queue placement", () => {
    it("puts play next directly after the current track", () => {
        const items = [track("history"), track("current", true), track("later")];

        expect(playerQueueIndex(items)).toBe(1);
        expect(queueInsertIndex(items, "next")).toBe(2);
        expect(queueInsertIndex(items, "end")).toBe(3);
    });

    it("uses the store's selected index when the renderer drops the flag", () => {
        const items = [track("current"), track("later")];

        expect(playerQueueIndex(items)).toBe(-1);
        expect(queueInsertIndex(items, "next", 0)).toBe(1);
    });

    it("appends instead of guessing an unusable index", () => {
        const items = [track("a"), track("b"), track("c")];

        expect(queueInsertIndex(items, "next")).toBe(3);
        expect(queueInsertIndex(items, "next", 9)).toBe(3);
    });

    it("only treats the current track and what follows it as queued", () => {
        const items = [
            ...parsePlayerQueue([track("played"), track("current", true), track("later")]),
            ...parsePlayerQueue([track("preview")]).map((item) => ({
                ...item,
                id: `automix:${item.id}`,
            })),
        ];

        const ids = upcomingVideoIds(items);

        expect([...ids]).toEqual(["current", "later"]);
        expect(ids.has("played")).toBe(false);
        expect(ids.has("preview")).toBe(false);
        expect(upcomingVideoIds(items, "playing").has("playing")).toBe(true);
    });
});
