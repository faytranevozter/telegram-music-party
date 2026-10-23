export const YTMP_BRIDGE = "ytmp-bridge";
export const YTMP_MAIN = "ytmp-main";

export type ControlAction =
    | "play"
    | "pause"
    | "next"
    | "prev"
    | "volumeUp"
    | "volumeDown"
    | "mute"
    | "unmute";

export type PlaybackInfo = {
    song: string;
    artist: string;
    state: "playing" | "paused" | "standby";
};

export type QueueItem = {
    id: string;
    url: string;
    title?: string;
    artist?: string;
    current?: boolean;
};

export type SessionStatus = {
    connected: boolean;
    socketConnected: boolean;
    /** True when a room ID is saved (joined or reconnecting), false when never joined */
    hasRoom: boolean;
    /** True when the server refused the join because another device owns the room */
    joinRejected: boolean;
    roomId: string | null;
    partyUrl: string | null;
    playback: PlaybackInfo | null;
    queue: QueueItem[];
    queueAvailable: boolean;
    userQueue: QueueItem[];
    bypassContinueWatching: boolean;
};

export type BridgeRequest =
    | { type: "GET_STATUS" }
    | { type: "CONTROL"; action: ControlAction }
    | { type: "LEAVE" }
    | { type: "JOIN" }
    | { type: "SET_CONTINUE_WATCHING_BYPASS"; enabled: boolean };

export type BridgeResponse =
    | { type: "STATUS"; status: SessionStatus }
    | { type: "OK" }
    | { type: "ERROR"; message: string };

export type BridgeRequestMessage = BridgeRequest & {
    source: typeof YTMP_BRIDGE;
    id: string;
};

export type BridgeResponseMessage = BridgeResponse & {
    source: typeof YTMP_MAIN;
    id: string;
};

/** Unsolicited status push from MAIN → isolated → popup */
export type StatusPushMessage = {
    source: typeof YTMP_MAIN;
    type: "STATUS_PUSH";
    status: SessionStatus;
};

export type PopupStatusMessage = {
    type: "STATUS_PUSH";
    status: SessionStatus;
};
