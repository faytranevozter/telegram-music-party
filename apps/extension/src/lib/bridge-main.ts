import type { Socket } from "socket.io-client";
import { getConfig } from "../constants/config";
import {
    BridgeRequestMessage,
    BridgeResponse,
    BridgeResponseMessage,
    ControlAction,
    SessionStatus,
    StatusPushMessage,
    YTMP_BRIDGE,
    YTMP_MAIN,
} from "../shared/messages";
import {
    getPlaybackState,
    next,
    pause,
    play,
    prev,
    Queue,
    toggleMute,
    volumeDown,
    volumeUp,
} from "./playback";

type Session = {
    socket: Socket | null;
    roomId: string | null;
    partyUrl: string | null;
    queues: Queue[];
    joined: boolean;
};

const session: Session = {
    socket: null,
    roomId: null,
    partyUrl: null,
    queues: [],
    joined: false,
};

export function buildStatus(): SessionStatus {
    const config = getConfig();
    const roomId = session.roomId ?? config.roomId;
    const partyUrl = session.partyUrl ?? config.partyUrl;
    const hasRoom = Boolean(roomId);
    const socketConnected = Boolean(session.socket?.connected);
    const connected = hasRoom && session.joined && socketConnected;

    let playback: SessionStatus["playback"] = null;
    try {
        const state = getPlaybackState();
        playback = {
            song: state.song || "",
            artist: state.artist || "",
            state: state.state,
        };
    } catch {
        playback = null;
    }

    return {
        connected,
        socketConnected,
        hasRoom,
        roomId,
        partyUrl,
        playback,
        queue: session.queues.map((item) => ({
            id: item.id,
            url: item.url,
            title: item.title,
        })),
    };
}

export function publishStatus() {
    const message: StatusPushMessage = {
        source: YTMP_MAIN,
        type: "STATUS_PUSH",
        status: buildStatus(),
    };
    window.postMessage(message, "*");
}

export function setBridgeSession(partial: Partial<Session>) {
    Object.assign(session, partial);
    publishStatus();
}

export function getBridgeSession(): Session {
    return session;
}

function runControl(action: ControlAction) {
    switch (action) {
        case "play":
            play();
            break;
        case "pause":
            pause();
            break;
        case "next":
            next();
            break;
        case "prev":
            prev();
            break;
        case "volumeUp":
            volumeUp();
            break;
        case "volumeDown":
            volumeDown();
            break;
        case "mute":
        case "unmute":
            toggleMute();
            break;
    }
    publishStatus();
}

function leaveRoom() {
    const config = getConfig();
    const roomId = session.roomId ?? config.roomId;
    const fingerprint = config.fingerprint;

    if (session.socket?.connected && roomId && fingerprint) {
        session.socket.emit("leave", {
            roomId,
            fingerprint,
        });
    }

    localStorage.removeItem("roomId");
    localStorage.removeItem("partyUrl");
    session.joined = false;
    session.queues = [];
    session.roomId = null;
    publishStatus();
    window.location.reload();
}

function handleRequest(request: BridgeRequestMessage): BridgeResponse {
    switch (request.type) {
        case "GET_STATUS":
            return { type: "STATUS", status: buildStatus() };
        case "CONTROL":
            if (!session.joined && !session.roomId) {
                return {
                    type: "ERROR",
                    message: "Not connected to a room",
                };
            }
            if (!session.socket?.connected) {
                return {
                    type: "ERROR",
                    message: "Server unreachable",
                };
            }
            runControl(request.action);
            return { type: "OK" };
        case "LEAVE":
            if (!session.roomId && !getConfig().roomId) {
                return { type: "ERROR", message: "Not in a room" };
            }
            leaveRoom();
            return { type: "OK" };
        default:
            return { type: "ERROR", message: "Unknown request" };
    }
}

export function startMainBridge() {
    window.addEventListener("message", (event: MessageEvent) => {
        if (event.source !== window) return;
        const data = event.data as BridgeRequestMessage | undefined;
        if (!data || data.source !== YTMP_BRIDGE || !data.id) return;

        let response: BridgeResponse;
        try {
            response = handleRequest(data);
        } catch (error) {
            response = {
                type: "ERROR",
                message:
                    error instanceof Error
                        ? error.message
                        : "Request failed",
            };
        }

        const message: BridgeResponseMessage = {
            source: YTMP_MAIN,
            id: data.id,
            ...response,
        };
        window.postMessage(message, "*");
    });
}

export function startPlaybackStatusWatchers() {
    const onPlaybackChange = () => {
        publishStatus();
    };

    const bindVideo = () => {
        const video = document.querySelector(
            "#movie_player > div.html5-video-container > video",
        ) as HTMLVideoElement | null;
        if (!video || (video as HTMLVideoElement & { __ytmpBound?: boolean }).__ytmpBound) {
            return;
        }
        (video as HTMLVideoElement & { __ytmpBound?: boolean }).__ytmpBound =
            true;
        video.addEventListener("play", onPlaybackChange);
        video.addEventListener("pause", onPlaybackChange);
        video.addEventListener("ended", onPlaybackChange);
    };

    bindVideo();

    const titleEl = document.querySelector(".title.ytmusic-player-bar");
    if (titleEl) {
        new MutationObserver(() => {
            bindVideo();
            onPlaybackChange();
        }).observe(titleEl, { childList: true, subtree: true, characterData: true });
    }

    // YT player mounts late
    const boot = setInterval(() => {
        bindVideo();
        if (
            document.querySelector(
                "#movie_player > div.html5-video-container > video",
            )
        ) {
            clearInterval(boot);
            onPlaybackChange();
        }
    }, 1000);
    setTimeout(() => clearInterval(boot), 30000);
}
