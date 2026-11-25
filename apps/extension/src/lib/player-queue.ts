import type { QueueItem } from "../shared/messages";

export type PlayerQueueSnapshot = {
    available: boolean;
    items: QueueItem[];
};

export function readAutoplayEnabled(): boolean | undefined {
    try {
        return getStore()?.getState()?.queue?.autoplay;
    } catch {
        return undefined;
    }
}

export function readInfiniteQueue(): boolean | undefined {
    try {
        const queue = getStore()?.getState()?.queue;
        return queue?.items?.length && typeof queue.isInfinite === "boolean" ? queue.isInfinite : undefined;
    } catch {
        return undefined;
    }
}

type QueueStore = {
    getState: () => { queue?: {
        items?: unknown[];
        automixItems?: unknown[];
        autoplay?: boolean;
        isInfinite?: boolean;
        selectedItemIndex?: number;
    } };
    subscribe?: (listener: () => void) => () => void;
};

export const AUTOPLAY_PREVIEW_LIMIT = 5;

export function splitQueue(items: QueueItem[], requests: QueueItem[]) {
    const currentIndex = items.findIndex((item) => item.current);
    const upcoming = currentIndex >= 0 ? items.slice(currentIndex + 1) : items;
    const requestedIds = new Set(requests.map((item) => item.url));
    const user = upcoming.filter((item) => requestedIds.has(item.url));
    // Requests waiting for player synchronization must not disappear from the UI.
    for (const request of requests) {
        if (!items.some((item) => item.url === request.url)) user.push(request);
    }
    const autoplay = upcoming.filter((item) => !requestedIds.has(item.url));
    return {
        user,
        autoplay: autoplay.slice(0, AUTOPLAY_PREVIEW_LIMIT),
        hiddenAutoplay: Math.max(0, autoplay.length - AUTOPLAY_PREVIEW_LIMIT),
    };
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
}

function text(value: unknown): string {
    if (typeof value === "string") return value;
    const data = record(value);
    if (typeof data.simpleText === "string") return data.simpleText;
    return Array.isArray(data.runs)
        ? data.runs.map((run) => record(run).text ?? "").join("")
        : "";
}

export function parsePlayerQueue(items: unknown[]): QueueItem[] {
    return items.flatMap((value, index) => {
        const item = record(value);
        const content = record(item.content ?? item);
        const wrapper = record(content.playlistPanelVideoWrapperRenderer);
        const primary = record(wrapper.primaryRenderer);
        const renderer = record(content.playlistPanelVideoRenderer ??
            primary.playlistPanelVideoRenderer ?? content);
        const endpoint = record(record(renderer.navigationEndpoint).watchEndpoint);
        const length = text(renderer.lengthText).trim();
        const seconds = /^\d{1,6}(?::[0-5]\d){1,2}$/.test(length)
            ? length.split(":").reduce((total, part) => total * 60 + Number(part), 0)
            : 0;
        const videoId = renderer.videoId ?? item.videoId ??
            record(item.playlistItemData).videoId ?? endpoint.videoId;
        if (typeof videoId !== "string" || !videoId) return [];
        return [{
            id: `${index}:${videoId}`,
            url: videoId,
            title: text(renderer.title) || "Unknown track",
            artist: text(renderer.shortBylineText ?? renderer.longBylineText),
            current: renderer.selected === true,
            ...(seconds > 0 ? { durationSeconds: seconds } : {}),
        }];
    });
}

/**
 * Index of the track the player is on, taken from the raw store array so it can
 * be used as an `ADD_ITEMS` index. Some player versions drop the `selected`
 * flag from the renderer and only expose `selectedItemIndex`.
 */
export function playerQueueIndex(
    items: unknown[],
    selectedItemIndex?: unknown,
): number {
    const selected = items.findIndex(
        (item) => parsePlayerQueue([item])[0]?.current === true,
    );
    if (selected >= 0) return selected;
    return typeof selectedItemIndex === "number" &&
        selectedItemIndex >= 0 &&
        selectedItemIndex < items.length
        ? selectedItemIndex
        : -1;
}

/**
 * Where `music/get_queue` items belong: directly after the current track for
 * "next", at the tail for "end". Appending when the current track cannot be
 * identified is safer than guessing a position the player will skip over.
 */
export function queueInsertIndex(
    items: unknown[],
    position: "end" | "next",
    selectedItemIndex?: unknown,
): number {
    if (position === "end") return items.length;
    const current = playerQueueIndex(items, selectedItemIndex);
    return current >= 0 ? current + 1 : items.length;
}

/**
 * Videos the player has not passed yet: the current track and everything after
 * it. History and the automix preview are not upcoming — treating an already
 * played track as queued makes Play Next a silent no-op while the room keeps
 * the row forever.
 */
export function upcomingVideoIds(
    items: QueueItem[],
    currentVideoId?: string | null,
): Set<string> {
    const currentIndex = items.findIndex((item) => item.current);
    const upcoming = (currentIndex >= 0 ? items.slice(currentIndex) : items)
        .filter((item) => !item.id.startsWith("automix:"));
    const ids = new Set(upcoming.map((item) => item.url));
    if (currentVideoId) ids.add(currentVideoId);
    return ids;
}

function getStore(): QueueStore | undefined {
    const queue = document.querySelector("#queue") as (Element & {
        queue?: { store?: { store?: QueueStore } };
    }) | null;
    return queue?.queue?.store?.store;
}

export function readPlayerQueue(): PlayerQueueSnapshot {
    try {
        // State shape documented by pear-desktop/src/types/datahost-get-state.ts.
        const queue = getStore()?.getState()?.queue;
        if (!Array.isArray(queue?.items)) return { available: false, items: [] };
        const items = parsePlayerQueue(queue.items);
        if (!items.some((item) => item.current) && typeof queue.selectedItemIndex === "number") {
            const selected = parsePlayerQueue([queue.items[queue.selectedItemIndex]])[0];
            const match = selected && items.find((item) => item.id === `${queue.selectedItemIndex}:${selected.url}`);
            if (match) match.current = true;
        }
        const automix = queue.autoplay === true && Array.isArray(queue.automixItems)
            ? parsePlayerQueue(queue.automixItems).map((item) => ({
                ...item, id: `automix:${item.id}`, current: false,
            }))
            : [];
        return { available: true, items: [...items, ...automix] };
    } catch {
        return { available: false, items: [] };
    }
}

export type QueueAcceptance = "added" | "missing" | "unknown";

/**
 * Resolve once the player queue lists the video. `missing` means the queue was
 * readable but the track never arrived (YouTube Music refused it); `unknown`
 * means the queue store could not be read, so nothing can be concluded.
 */
export async function waitForQueueItem(
    videoId: string,
    timeoutMs = 2000,
    read: () => PlayerQueueSnapshot = readPlayerQueue,
): Promise<QueueAcceptance> {
    let readable = false;
    const contains = () => {
        const snapshot = read();
        readable ||= snapshot.available;
        return snapshot.items.some((item) => item.url === videoId);
    };
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (contains()) return "added";
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (contains()) return "added";
    return readable ? "missing" : "unknown";
}

/** Rebind on late mount/navigation; sampling also covers stores without subscribe. */
export function watchPlayerQueue(onChange: () => void): () => void {
    let store: QueueStore | undefined;
    let unsubscribe: (() => void) | undefined;
    let previous = "";
    let pending: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
        const snapshot = JSON.stringify(readPlayerQueue());
        if (snapshot === previous) return;
        previous = snapshot;
        onChange();
    };
    const schedule = () => {
        if (pending !== undefined) return;
        pending = setTimeout(() => {
            pending = undefined;
            check();
        }, 50);
    };
    const bind = () => {
        const next = getStore();
        if (next !== store) {
            unsubscribe?.();
            store = next;
            unsubscribe = undefined;
            try {
                unsubscribe = store?.subscribe?.(schedule);
            } catch {
                // Some player versions expose only getState.
            }
        }
        check();
    };
    bind();
    const timer = setInterval(bind, 1000);
    return () => {
        clearInterval(timer);
        if (pending !== undefined) clearTimeout(pending);
        unsubscribe?.();
    };
}
