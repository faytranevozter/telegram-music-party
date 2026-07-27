import { getDeviceId } from "../lib/browser";

export const DEFAULT_PARTY_URL = "http://localhost:3000";

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