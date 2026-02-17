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