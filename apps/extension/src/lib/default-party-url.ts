import { DEFAULT_PARTY_URL } from "../constants/config";

export const DEFAULT_PARTY_URL_STORAGE_KEY = "defaultPartyUrl";

export async function getDefaultPartyUrl(): Promise<string> {
    try {
        const result = await chrome.storage.local.get(
            DEFAULT_PARTY_URL_STORAGE_KEY,
        );
        const value = result[DEFAULT_PARTY_URL_STORAGE_KEY];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    } catch {
        // storage unavailable (tests / non-extension context)
    }
    return DEFAULT_PARTY_URL;
}

export async function setDefaultPartyUrl(url: string): Promise<void> {
    const trimmed = url.trim();
    if (!trimmed) {
        await chrome.storage.local.remove(DEFAULT_PARTY_URL_STORAGE_KEY);
        return;
    }
    await chrome.storage.local.set({
        [DEFAULT_PARTY_URL_STORAGE_KEY]: trimmed,
    });
}

export function normalizePartyUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return null;
        }
        return trimmed;
    } catch {
        return null;
    }
}
