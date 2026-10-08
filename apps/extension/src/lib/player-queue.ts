import type { QueueItem } from "../shared/messages";

export type PlayerQueueSnapshot = {
    available: boolean;
    items: QueueItem[];
};

type QueueStore = {
    getState: () => { queue?: {
        items?: unknown[];
        automixItems?: unknown[];
        autoplay?: boolean;
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
        const videoId = renderer.videoId ?? item.videoId ??
            record(item.playlistItemData).videoId ?? endpoint.videoId;
        if (typeof videoId !== "string" || !videoId) return [];
        return [{
            id: `${index}:${videoId}`,
            url: videoId,
            title: text(renderer.title) || "Unknown track",
            artist: text(renderer.shortBylineText ?? renderer.longBylineText),
            current: renderer.selected === true,
        }];
    });
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
