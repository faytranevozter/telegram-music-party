import { getDeviceId } from "../lib/browser";

export const DEFAULT_PARTY_URL = "https://music.ytparty.my.id";

export function validateRoomConfig(roomId: string, partyUrl: string) {
    if (typeof roomId !== "string" || !roomId.trim()) {
        throw new Error("Enter a room ID from Telegram /register.");
    }
    if (typeof partyUrl !== "string") {
        throw new Error("Enter a valid HTTP(S) party server URL.");
    }
    const trimmedUrl = partyUrl.trim();
    let url: URL;
    try {
        url = new URL(trimmedUrl);
    } catch {
        throw new Error("Enter a valid HTTP(S) party server URL.");
    }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
        throw new Error("Enter a valid HTTP(S) party server URL.");
    }
    // Keep custom paths and ports intact; Socket.IO may use the path as a namespace.
    return { roomId: roomId.trim(), partyUrl: trimmedUrl };
}

export function saveRoomConfig(roomId: string, partyUrl: string) {
    const config = validateRoomConfig(roomId, partyUrl);
    localStorage.setItem("partyUrl", config.partyUrl);
    localStorage.setItem("roomId", config.roomId);
    return config;
}

export type Config = {
    partyUrl: string | null;
    roomId: string | null;
    fingerprint: string | null;
};

export function getConfig(): Config {
    return {
        partyUrl: localStorage.getItem("partyUrl"),
        roomId: localStorage.getItem("roomId"),
        fingerprint: getDeviceId(),
    };
}

export const BYPASS_CONTINUE_WATCHING_KEY = "ytmp_bypass_continue_watching";

// Default: enabled (key unset or anything but the literal "false")
export function isContinueWatchingBypassEnabled(): boolean {
    return localStorage.getItem(BYPASS_CONTINUE_WATCHING_KEY) !== "false";
}

export function setContinueWatchingBypass(enabled: boolean): void {
    localStorage.setItem(
        BYPASS_CONTINUE_WATCHING_KEY,
        enabled ? "true" : "false",
    );
}
