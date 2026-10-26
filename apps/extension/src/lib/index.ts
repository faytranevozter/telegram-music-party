/* eslint-disable @typescript-eslint/no-explicit-any */
import { io } from "socket.io-client";
import { readPlayerQueue } from "./player-queue";
import { DEFAULT_PARTY_URL, getConfig } from "../constants/config";
import {
    applyContinueWatchingSetting,
    getPlaybackState,
    getVideoId,
    lyrics,
    next,
    pause,
    play,
    prev,
    Queue,
    resume,
    stopContinueWatchingWatcher,
    stopIdleKeepAlive,
    toggleMute,
    volumeDown,
    volumeUp,
} from "./playback";
import { createJoinButton, createLeaveButton, getDeviceInfo } from "./browser";
import {
    publishStatus,
    setBridgeSession,
    startMainBridge,
    startPlaybackStatusWatchers,
} from "./bridge-main";
import {
    noteSkipIntent,
    startPlaybackAnalytics,
} from "./playback-analytics";

Object.defineProperty(window, "onbeforeunload", {
    get: () => null,
    set: () => {},
    configurable: true,
});

function getAppInstance<T>() {
    const app = document.querySelector("ytmusic-app");
    return app as Element & {
        networkManager: {
            fetch: (url: string, init?: object) => Promise<T>;
        };
    };
}

function getQueueInstance() {
    const q = document.querySelector("#queue") as Element & {
        dispatch: (action: any) => void;
        queue: {
            store: {
                store: {
                    dispatch: (action: any) => void;
                    getState: () => any;
                };
            };
        };
    };
    (globalThis as any).queue = q;

    return q;
}

type QueuePosition = "end" | "next";

type PlaybackNotification =
    | { type: "queue-empty" }
    | { type: "now-playing"; song: string; artist: string }
    | { type: "paused"; song: string; artist: string }
    | {
          type: "volume-changed";
          direction: "increased" | "decreased";
          volume: number;
      }
    | { type: "mute-changed"; muted: boolean }
    | { type: "lyrics"; text: string | null };

function getSelectedRenderer(item: unknown): Record<string, any> | undefined {
    if (!item || typeof item !== "object") return undefined;
    const it = item as Record<string, any>;
    return (
        it.playlistPanelVideoRenderer ||
        it.playlistPanelVideoWrapperRenderer?.primaryRenderer
            ?.playlistPanelVideoRenderer ||
        it.content?.playlistPanelVideoRenderer ||
        it.content?.playlistPanelVideoWrapperRenderer?.primaryRenderer
            ?.playlistPanelVideoRenderer
    );
}

function getYtQueueVideoIds(): Set<string> {
    const ids = new Set<string>();
    for (const item of readPlayerQueue().items) {
        ids.add(item.url);
    }
    const currentId = getVideoId();
    if (currentId) ids.add(currentId);
    return ids;
}

function getMissingQueueIds(serverQueues: Queue[]): string[] {
    const existing = getYtQueueVideoIds();
    const missing: string[] = [];
    for (const item of serverQueues) {
        if (!item.url || existing.has(item.url)) continue;
        if (missing.includes(item.url)) continue;
        missing.push(item.url);
    }
    return missing;
}

const RADIO_PLAYLIST_PREFIX = "RDAMVM";
const AUTOPLAY_TIMEOUT_MS = 5000;

type YtMusicApp = Element & {
    handleNavigationEndpoint: (endpoint: {
        watchEndpoint: { videoId: string; playlistId?: string };
    }) => void;
};

type YtMusicAppCandidate = Element & {
    handleNavigationEndpoint?: YtMusicApp["handleNavigationEndpoint"];
};

function playerQueueSignature(
    snapshot: ReturnType<typeof readPlayerQueue> = readPlayerQueue(),
): string {
    return JSON.stringify(
        snapshot.items
            .slice(0, 20)
            .map((item) => `${item.url}:${item.current}`),
    );
}

function currentPlaylistId(): string | null {
    try {
        return new URL(window.location.href).searchParams.get("list");
    } catch {
        return null;
    }
}

function realQueueItems(snapshot: ReturnType<typeof readPlayerQueue>) {
    return snapshot.items.filter((item) => !item.id.startsWith("automix:"));
}

async function waitForRadioQueue(
    videoId: string,
    previousSignature: string,
): Promise<boolean> {
    const expectedRadio = `${RADIO_PLAYLIST_PREFIX}${videoId}`;
    const deadline = Date.now() + AUTOPLAY_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const snapshot = readPlayerQueue();
        const items = realQueueItems(snapshot);
        const current = items.find((item) => item.current);
        const radioReady =
            current?.url === videoId &&
            items.length > 1 &&
            (currentPlaylistId() === expectedRadio ||
                playerQueueSignature(snapshot) !== previousSignature);
        if (snapshot.available && radioReady) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
}

/**
 * `/refresh` should leave only the current song in the queue so YT Music
 * autoplay fills the rest. The plain watch URL does exactly that.
 */
async function waitForRefreshedQueue(
    videoId: string,
    previousSignature: string,
): Promise<boolean> {
    const deadline = Date.now() + AUTOPLAY_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const snapshot = readPlayerQueue();
        const items = realQueueItems(snapshot);
        const current = items[0];
        const refreshed =
            current?.url === videoId &&
            current.current === true &&
            items.length === 1 &&
            (currentPlaylistId() === null ||
                playerQueueSignature(snapshot) !== previousSignature);
        if (snapshot.available && refreshed) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
}

async function addQueue(videoIds: string, position: QueuePosition = "end") {
    if (videoIds.length < 1) return;
    // setTimeout (not rAF): background tabs suspend rAF until focused again
    await new Promise((resolve) => setTimeout(resolve, 0));
    const app = getAppInstance();
    const queue = getQueueInstance();
    const store = queue?.queue.store.store;
    const state = store.getState().queue;
    const payload = {
        queueContextParams: state.queueContextParams,
        queueInsertPosition:
            position === "next" ? "INSERT_AFTER_CURRENT_VIDEO" : "INSERT_AT_END",
        videoIds: videoIds.split(","),
    };

    await app.networkManager
        .fetch("music/get_queue", payload)
        .then((result) => {
            if (
                result &&
                typeof result === "object" &&
                "queueDatas" in result &&
                Array.isArray(result.queueDatas)
            ) {
                const currentState = store.getState().queue;
                const queueItems = currentState.items;
                const queueItemsLength = queueItems.length ?? 0;
                const index =
                    position === "next"
                        ? queueItems.findIndex((it: any) =>
                              getSelectedRenderer(it)?.selected,
                          ) + 1 || queueItemsLength
                        : queueItemsLength;
                queue?.dispatch({
                    type: "ADD_ITEMS",
                    payload: {
                        nextQueueItemId: currentState.nextQueueItemId,
                        index,
                        items: result.queueDatas
                            .map((it) =>
                                typeof it === "object" && it && "content" in it
                                    ? it.content
                                    : null,
                            )
                            .filter(Boolean),
                        shuffleEnabled: false,
                        shouldAssignIds: true,
                    },
                });
            }
        });
}

const detectSongChange = (
    callback: (
        playback: ReturnType<typeof getPlaybackState>,
        videoId: string | null,
    ) => void,
) => {
    // observe title changes to detect song changes
    const playbackObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation, i) => {
            if (
                mutation.type === "childList" &&
                i == 0 &&
                mutation.target.textContent
            ) {
                setTimeout(
                    () => {
                        const playback = getPlaybackState();
                        const videoId = getVideoId();

                        callback(playback, videoId);
                    },
                    1000,
                );
            }
        });
    });

    const titleElement = document.querySelector(".title.ytmusic-player-bar");
    if (titleElement) {
        playbackObserver.observe(titleElement, {
            childList: true,
            subtree: true,
        });
    }
};

startMainBridge();

document.addEventListener("DOMContentLoaded", async () => {
    // get current config
    const config = getConfig();

    const partyURL = config.partyUrl || DEFAULT_PARTY_URL;
    const ROOM_ID = config.roomId as string;
    let queues: Queue[] = [];
    let hasSynced = false;
    // Durable request IDs survive queue cleanup, so a song that starts right as
    // it is removed from the local queue still keeps its requester attribution.
    const requestIds = new Map<string, string>();
    const rememberRequest = (url: string, requestId?: string) => {
        if (url && requestId) requestIds.set(url, requestId);
    };

    console.log("Current config:", config);

    setBridgeSession({
        roomId: config.roomId,
        partyUrl: config.partyUrl,
        queues: [],
        joined: false,
        socket: null,
    });
    startPlaybackStatusWatchers();

    // if roomId or partyURL doesnot exist
    if (!config.partyUrl || !config.roomId) {
        // display join button
        createJoinButton();

        // wait for user to join
        return;
    }

    // initialize socket connection
    const socket = io(partyURL);
    socket.on("get-player-queue", (ack: (snapshot: unknown) => void) => {
        if (typeof ack === "function") ack(readPlayerQueue());
    });
    setBridgeSession({
        socket,
        roomId: config.roomId,
        partyUrl: config.partyUrl,
        queues: [],
        joined: false,
    });

    // Playback analytics is independent of Telegram notification preferences.
    // The backend accepts reports only while this device owns the room.
    startPlaybackAnalytics({
        socket,
        getRoomId: () => ROOM_ID,
        getRequestId: (videoId) => requestIds.get(videoId) ?? null,
    });

    const sendPlaybackNotification = (
        notification: PlaybackNotification,
    ) => {
        socket.emit("playback-notification", {
            ...notification,
            roomId: ROOM_ID,
        });
    };

    type AutoplayResponse =
        | {
              status: "ok";
              videoId: string;
              song: string;
              artist: string;
          }
        | { status: "no-current-song" | "unavailable" };

    const currentTrack = () => {
        const playback = getPlaybackState();
        const videoId = getVideoId();
        if (!videoId || playback.state === "standby") return null;
        return { playback, videoId };
    };

    const getYtMusicApp = (): YtMusicApp | null => {
        const app = document.querySelector(
            "ytmusic-app",
        ) as YtMusicAppCandidate | null;
        return app && typeof app.handleNavigationEndpoint === "function"
            ? (app as YtMusicApp)
            : null;
    };

    // Both commands replace the player queue. Put songs requested through the
    // bot back in front of the recommendations.
    const restoreRequestedSongs = async () => {
        const missing = getMissingQueueIds(queues);
        if (missing.length > 0) {
            await addQueue(missing.join(","), "next");
        }
    };

    const applyAutoplay = async (
        track: NonNullable<ReturnType<typeof currentTrack>>,
        endpoint: { watchEndpoint: { videoId: string; playlistId?: string } },
        ready: (previousSignature: string) => Promise<boolean>,
        label: string,
    ): Promise<AutoplayResponse> => {
        const app = getYtMusicApp();
        if (!app) return { status: "unavailable" };

        const previousQueue = playerQueueSignature();
        try {
            app.handleNavigationEndpoint(endpoint);
        } catch (error) {
            console.error(`${label} failed`, error);
            return { status: "unavailable" };
        }

        if (!(await ready(previousQueue))) {
            return { status: "unavailable" };
        }

        await restoreRequestedSongs();
        publishStatus();

        return {
            status: "ok",
            videoId: track.videoId,
            song: track.playback.song || "",
            artist: track.playback.artist || "",
        };
    };

    /**
     * `/radio` starts the current song's radio in place. Playback keeps going
     * while the radio queue replaces the player queue.
     */
    const startRadio = async (): Promise<AutoplayResponse> => {
        const track = currentTrack();
        if (!track) return { status: "no-current-song" };

        return applyAutoplay(
            track,
            {
                watchEndpoint: {
                    videoId: track.videoId,
                    playlistId: `${RADIO_PLAYLIST_PREFIX}${track.videoId}`,
                },
            },
            (previousSignature) =>
                waitForRadioQueue(track.videoId, previousSignature),
            "start radio",
        );
    };

    /**
     * `/refresh` reloads the current song as a plain watch queue: one item
     * followed by YT Music's autoplay recommendations.
     */
    const refreshAutoplay = async (): Promise<AutoplayResponse> => {
        const track = currentTrack();
        if (!track) return { status: "no-current-song" };

        return applyAutoplay(
            track,
            { watchEndpoint: { videoId: track.videoId } },
            (previousSignature) =>
                waitForRefreshedQueue(track.videoId, previousSignature),
            "refresh queue",
        );
    };

    socket.on("start-radio", async (ack?: (result: unknown) => void) => {
        const result = await startRadio();
        if (typeof ack === "function") ack(result);
    });

    socket.on(
        "refresh-autoplay",
        async (ack?: (result: unknown) => void) => {
            const result = await refreshAutoplay();
            if (typeof ack === "function") ack(result);
        },
    );

    // Prevent YT "Continue watching?" via window._lact (pear-desktop approach)
    // and fall back to auto-clicking the dialog if it still appears.
    // Honors the persisted bypass setting (default: enabled).
    applyContinueWatchingSetting();

    // create leave button
    createLeaveButton(socket, config);

    // handle incoming messages
    socket.on("joined", async (data: Array<Queue & { title?: string }>) => {
        for (const item of data) {
            // Queue rows reuse the durable request ID.
            rememberRequest(item.url, item.id);
        }
        queues = data.map((item) => ({
            id: item.id,
            url: item.url,
            title: item.title,
            // Queue rows reuse the durable request ID, so joined rows can
            // correlate playback without another column.
            requestId: item.id,
        }));
        setBridgeSession({ queues, joined: true, joinRejected: false });
        const playback = getPlaybackState();
        const isColdStart = !hasSynced && playback.state === "standby";
        const head = data[0];
        const currentId = getVideoId();

        // Cold start with a waiting queue: navigate once to the head track.
        // If we're already on that /watch URL (after the first redirect), do not
        // call play(head) again — location.href to the same page reloads forever
        // while the player is still standby / video.src empty.
        if (isColdStart && head) {
            if (currentId === head.url) {
                hasSynced = true;
            } else {
                play(head);
                // Page is unloading; skip queue DOM sync on this document.
                return;
            }
        }

        setTimeout(async () => {
            const missing = getMissingQueueIds(data);
            if (missing.length > 0) {
                await addQueue(missing.join(","));
            }
            hasSynced = true;
            publishStatus();
        }, 1000);
    });

    // the room already has a connected player; we must not take over
    socket.on("join-rejected", () => {
        console.log("Join rejected: room already has a connected player");
        queues = [];
        hasSynced = false;
        setBridgeSession({ joined: false, queues: [], joinRejected: true });
    });

    // handle on leave
    socket.on("leave", async () => {
        hasSynced = false;
        setBridgeSession({
            joined: false,
            queues: [],
            roomId: null,
            joinRejected: false,
        });
        stopIdleKeepAlive();
        stopContinueWatchingWatcher();
        // clear local storage
        localStorage.removeItem("roomId");

        // reload page
        window.location.reload();
    });

    // handle on connect (fire when user joined the room or refresh the page)
    socket.on("connect", async () => {
        console.log("Connected to WebSocket server with ID:", socket.id);
        setBridgeSession({ joinRejected: false });

        socket.emit("join", getDeviceInfo(config));
    });

    // handle on disconnect — keep hasRoom; only socket is offline
    socket.on("disconnect", () => {
        console.log("Disconnected from WebSocket server");
        setBridgeSession({ joined: false });
    });

    socket.on("connect_error", () => {
        publishStatus();
    });

    socket.on("play", () => {
        const playback = getPlaybackState();

        if (playback.state == "standby" && queues[0]) {
            // Navigate to head (or no-op if already on it) — never bare reload
            // (reload + standby + joined can loop when queue is waiting).
            play(queues[0]);
            publishStatus();
            return;
        }

        if (playback.state == "standby" && !queues[0]) {
            sendPlaybackNotification({
                type: "queue-empty",
            });
            publishStatus();
            return;
        }

        play();
        publishStatus();

        sendPlaybackNotification({
            type: "now-playing",
            song: playback.song,
            artist: playback.artist,
        });
    });

    socket.on("pause", () => {
        pause();
        publishStatus();

        const playback = getPlaybackState();

        sendPlaybackNotification({
            type: "paused",
            song: playback.song,
            artist: playback.artist,
        });
    });

    socket.on("next", () => {
        noteSkipIntent();
        next();
        publishStatus();
    });

    socket.on("prev", () => {
        noteSkipIntent();
        prev();
        publishStatus();
    });

    socket.on("volumeUp", () => {
        const currentVolume = volumeUp();
        publishStatus();

        sendPlaybackNotification({
            type: "volume-changed",
            direction: "increased",
            volume: currentVolume,
        });
    });

    socket.on("volumeDown", () => {
        const currentVolume = volumeDown();
        publishStatus();

        sendPlaybackNotification({
            type: "volume-changed",
            direction: "decreased",
            volume: currentVolume,
        });
    });

    socket.on("mute", () => {
        toggleMute();
        publishStatus();

        sendPlaybackNotification({
            type: "mute-changed",
            muted: true,
        });
    });

    socket.on("unmute", () => {
        toggleMute();
        publishStatus();

        sendPlaybackNotification({
            type: "mute-changed",
            muted: false,
        });
    });

    socket.on("lyrics", async () => {
        const text = await lyrics();

        sendPlaybackNotification({
            type: "lyrics",
            text: typeof text === "string" ? text : null,
        });
    });

    // i dont know why this is needed but just in case
    socket.on("resume", () => {
        resume();
        publishStatus();
    });

    socket.on(
        "addToQueue",
        async ({
            videoId,
            position,
            title,
            requestId,
        }: {
            videoId: string;
            position?: QueuePosition;
            title?: string;
            requestId?: string;
        }) => {
            console.log("addToQueue", videoId, title);

            const queueItem: Queue = {
                id: crypto.randomUUID(),
                url: videoId,
                title,
                requestId,
            };
            rememberRequest(videoId, requestId);

            if (position === "next") {
                queues = [queueItem, ...queues.filter((q) => q.url !== videoId)];
            } else if (!queues.some((q) => q.url === videoId)) {
                queues = [...queues, queueItem];
            } else {
                queues = queues.map((q) =>
                    q.url === videoId ? { ...q, title: title ?? q.title } : q,
                );
            }
            setBridgeSession({ queues });

            const playback = getPlaybackState();
            if (playback.state == "standby") {
                return;
            }

            if (getYtQueueVideoIds().has(videoId)) return;

            await addQueue(videoId, position);
        },
    );

    // detect song changes
    detectSongChange((playback, videoId) => {
        if (videoId) {
            queues = queues.filter((q) => q.url !== videoId);
            setBridgeSession({ queues });
        } else {
            publishStatus();
        }

        socket.emit("started", {
            roomId: ROOM_ID,
            videoId: videoId,
        });

        sendPlaybackNotification({
            type: "now-playing",
            song: playback.song,
            artist: playback.artist,
        });
    });
});
