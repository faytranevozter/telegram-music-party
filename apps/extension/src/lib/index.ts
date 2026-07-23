/* eslint-disable @typescript-eslint/no-explicit-any */
import { io } from "socket.io-client";
import { detect } from "detect-browser";
import axios from "axios";
import { Config, DEFAULT_PARTY_URL, getConfig } from "../constants/config";
import {
    getPlaybackState,
    getVideoId,
    lyrics,
    next,
    pause,
    play,
    prev,
    Queue,
    resume,
    startContinueWatchingWatcher,
    startIdleKeepAlive,
    stopContinueWatchingWatcher,
    stopIdleKeepAlive,
    toggleMute,
    volumeDown,
    volumeUp,
} from "./playback";
import { createJoinButton, createLeaveButton, getDeviceId } from "./browser";

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

function extractVideoId(value: unknown): string | null {
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, any>;
    const candidates = [
        item.videoId,
        item.playlistPanelVideoRenderer?.videoId,
        item.playlistPanelVideoWrapperRenderer?.primaryRenderer
            ?.playlistPanelVideoRenderer?.videoId,
        item.content?.videoId,
        item.content?.playlistPanelVideoRenderer?.videoId,
        item.playlistItemData?.videoId,
        item.navigationEndpoint?.watchEndpoint?.videoId,
    ];
    for (const id of candidates) {
        if (typeof id === "string" && id.length > 0) return id;
    }
    return null;
}

function getYtQueueVideoIds(): Set<string> {
    const ids = new Set<string>();
    try {
        const store = getQueueInstance()?.queue?.store?.store;
        const items = store?.getState()?.queue?.items ?? [];
        for (const item of items) {
            const id = extractVideoId(item);
            if (id) ids.add(id);
        }
    } catch {
        // queue store may not be ready yet
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

async function addQueue(videoIds: string, position: QueuePosition = "end") {
    if (videoIds.length < 1) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
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
                        ? Math.max(queueItemsLength - 1, 0)
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

const getDeviceInfo = async (config: Config) => {
    console.log("Gathering device info...");

    const ifconfig = await axios.get("https://ifconfig.me/all.json", {
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
    });

    // detect browser info
    const info = detect();

    // get fingerprint
    const fingerprint = getDeviceId();

    const browser = [
        (info?.name?.slice(0, 1).toUpperCase() || "") +
            (info?.name?.slice(1) || ""),
        info?.os, // Mac OS, Windows
    ]; // [Chrome, Mac OS]

    return {
        id: config.roomId || "",
        browser: browser.filter(Boolean).join(" ") || "",
        ip: ifconfig.data.ip_addr || "",
        fingerprint,
    };
};

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

document.addEventListener("DOMContentLoaded", async () => {
    // get current config
    const config = getConfig();

    const partyURL = config.partyUrl || DEFAULT_PARTY_URL;
    const ROOM_ID = config.roomId as string;
    let queues: Queue[] = [];
    let hasSynced = false;

    console.log("Current config:", config);

    // if roomId or partyURL doesnot exist
    if (!config.partyUrl || !config.roomId) {
        // display join button
        createJoinButton();

        // wait for user to join
        return;
    }

    // initialize socket connection
    const socket = io(partyURL);

    // Prevent YT "Continue watching?" via window._lact (pear-desktop approach)
    // and fall back to auto-clicking the dialog if it still appears.
    startIdleKeepAlive();
    startContinueWatchingWatcher();

    // create leave button
    createLeaveButton(socket, config);

    // handle incoming messages
    socket.on("joined", async (data: Queue[]) => {
        queues = data;
        const playback = getPlaybackState();
        const isColdStart = !hasSynced && playback.state === "standby";

        if (isColdStart && data[0]) {
            play(data[0]);
        }

        setTimeout(async () => {
            const missing = getMissingQueueIds(data);
            if (missing.length > 0) {
                await addQueue(missing.join(","));
            }
            hasSynced = true;
        }, 1000);
    });

    // handle on leave
    socket.on("leave", async () => {
        hasSynced = false;
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

        const joinPayload = await getDeviceInfo(config);

        // emit join event to server
        socket.emit("join", joinPayload);
    });

    // handle on disconnect
    socket.on("disconnect", () => {
        console.log("Disconnected from WebSocket server");
    });

    socket.on("play", () => {
        const playback = getPlaybackState();

        if (playback.state == "standby" && queues[0]) {
            window.location.reload();
            return;
        }

        if (playback.state == "standby" && !queues[0]) {
            socket.emit("notify", {
                message: `🚫 No tracks in the queue right now.`,
                roomId: ROOM_ID,
            });
            return;
        }

        play();

        socket.emit("notify", {
            message: `Now playing: ___"${playback.song}"___ by ${playback.artist} 🎧`,
            roomId: ROOM_ID,
        });
    });

    socket.on("pause", () => {
        pause();

        const playback = getPlaybackState();

        socket.emit("notify", {
            message: `⏸️ ___${playback.song}___ - ${playback.artist} is now paused`,
            roomId: ROOM_ID,
        });
    });

    socket.on("next", () => {
        next();
    });

    socket.on("prev", () => {
        prev();
    });

    socket.on("volumeUp", () => {
        const currentVolume = volumeUp();

        // notify
        socket.emit("notify", {
            message: `🔊 Volume increased. Current volume: ${currentVolume}`,
            roomId: ROOM_ID,
        });
    });

    socket.on("volumeDown", () => {
        const currentVolume = volumeDown();

        // notify
        socket.emit("notify", {
            message: `🔊 Volume decreased. Current volume: ${currentVolume}`,
            roomId: ROOM_ID,
        });
    });

    socket.on("mute", () => {
        toggleMute();

        socket.emit("notify", {
            message: "🤫 Shhh... we're on mute. Enjoy the silence (for now)!",
            roomId: ROOM_ID,
        });
    });

    socket.on("unmute", () => {
        toggleMute();

        socket.emit("notify", {
            message: "🎶 We're back! Audio unmuted—let the music play!",
            roomId: ROOM_ID,
        });
    });

    socket.on("lyrics", async () => {
        const txt =
            (await lyrics()) ||
            "🤷‍♀️ No lyrics this time—guess we're freestyling!";

        socket.emit("notify", {
            message: txt,
            roomId: ROOM_ID,
        });
    });

    // i dont know why this is needed but just in case
    socket.on("resume", () => {
        resume();
    });

    socket.on(
        "addToQueue",
        async ({
            videoId,
            position,
        }: {
            videoId: string;
            position?: QueuePosition;
        }) => {
            const playback = getPlaybackState();
            console.log("addToQueue", videoId);

            if (playback.state == "standby") {
                const queue = {
                    id: crypto.randomUUID(),
                    url: videoId,
                };
                if (position === "next") {
                    queues.unshift(queue);
                    return;
                }
                queues.push(queue);
                return;
            }

            if (getYtQueueVideoIds().has(videoId)) return;

            await addQueue(videoId, position);
        },
    );

    // detect song changes
    detectSongChange((playback, videoId) => {
        socket.emit("started", {
            roomId: ROOM_ID,
            videoId: videoId,
        });

        socket.emit("notify", {
            message: `Now playing: ___"${playback.song}"___ by ${playback.artist} 🎧`,
            roomId: ROOM_ID,
        });
    });
});
