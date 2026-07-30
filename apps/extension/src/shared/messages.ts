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
};

export type SessionStatus = {
    connected: boolean;
    socketConnected: boolean;
    /** True when a room ID is saved (joined or reconnecting), false when never joined */
    hasRoom: boolean;
    roomId: string | null;
    partyUrl: string | null;
    playback: PlaybackInfo | null;
    queue: QueueItem[];
    bypassContinueWatching: boolean;
};

export type BridgeRequest =
    | { type: "GET_STATUS" }
    | { type: "CONTROL"; action: ControlAction }
    | { type: "LEAVE" }
    | { type: "JOIN"; roomId: string; partyUrl: string }
    | { type: "SET_CONTINUE_WATCHING_BYPASS"; enabled: boolean };

/** MAIN → ISOLATED: ask for extension-wide default party URL */
export type DefaultPartyUrlRequestMessage = {
    source: typeof YTMP_MAIN;
    type: "GET_DEFAULT_PARTY_URL";
    id: string;
};

/** ISOLATED → MAIN: default party URL from chrome.storage */
export type DefaultPartyUrlResponseMessage = {
    source: typeof YTMP_BRIDGE;
    type: "DEFAULT_PARTY_URL";
    id: string;
    partyUrl: string;
};

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
