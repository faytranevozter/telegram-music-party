import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PARTY_URL } from "../constants/config";
import {
    DEFAULT_PARTY_URL_STORAGE_KEY,
    getDefaultPartyUrl,
    normalizePartyUrl,
    setDefaultPartyUrl,
} from "./default-party-url";

describe("normalizePartyUrl", () => {
    it("accepts http and https URLs", () => {
        expect(normalizePartyUrl("http://localhost:3000")).toBe(
            "http://localhost:3000",
        );
        expect(normalizePartyUrl("  https://party.example/  ")).toBe(
            "https://party.example/",
        );
    });

    it("rejects empty and non-http schemes", () => {
        expect(normalizePartyUrl("")).toBeNull();
        expect(normalizePartyUrl("   ")).toBeNull();
        expect(normalizePartyUrl("ftp://x")).toBeNull();
        expect(normalizePartyUrl("not-a-url")).toBeNull();
    });
});

describe("getDefaultPartyUrl / setDefaultPartyUrl", () => {
    const store = new Map<string, string>();

    beforeEach(() => {
        store.clear();
        vi.stubGlobal("chrome", {
            storage: {
                local: {
                    get: vi.fn(async (key: string) => {
                        const value = store.get(key);
                        return value !== undefined ? { [key]: value } : {};
                    }),
                    set: vi.fn(async (items: Record<string, string>) => {
                        for (const [k, v] of Object.entries(items)) {
                            store.set(k, v);
                        }
                    }),
                    remove: vi.fn(async (key: string) => {
                        store.delete(key);
                    }),
                },
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("falls back to DEFAULT_PARTY_URL when unset", async () => {
        expect(await getDefaultPartyUrl()).toBe(DEFAULT_PARTY_URL);
    });

    it("reads and writes extension-wide default", async () => {
        await setDefaultPartyUrl("https://party.example");
        expect(store.get(DEFAULT_PARTY_URL_STORAGE_KEY)).toBe(
            "https://party.example",
        );
        expect(await getDefaultPartyUrl()).toBe("https://party.example");
    });

    it("clears storage when set to empty", async () => {
        await setDefaultPartyUrl("https://party.example");
        await setDefaultPartyUrl("  ");
        expect(store.has(DEFAULT_PARTY_URL_STORAGE_KEY)).toBe(false);
        expect(await getDefaultPartyUrl()).toBe(DEFAULT_PARTY_URL);
    });
});
