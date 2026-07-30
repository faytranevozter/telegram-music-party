import { describe, expect, it } from "vitest";

/**
 * Mirrors MAIN-world join validation used by bridge JOIN handler
 * (roomId + http(s) partyUrl). Full socket join requires a live YT Music tab.
 */
function validateJoin(
    roomIdRaw: string,
    partyUrlRaw: string,
): { ok: true; roomId: string; partyUrl: string } | { ok: false; message: string } {
    const roomId = roomIdRaw.trim();
    const partyUrl = partyUrlRaw.trim();
    if (!roomId) {
        return { ok: false, message: "Room ID is required" };
    }
    if (!partyUrl) {
        return { ok: false, message: "Party URL is required" };
    }
    try {
        const parsed = new URL(partyUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return {
                ok: false,
                message: "Party URL must be http or https",
            };
        }
    } catch {
        return { ok: false, message: "Invalid party URL" };
    }
    return { ok: true, roomId, partyUrl };
}

describe("JOIN validation", () => {
    it("requires room id and party url", () => {
        expect(validateJoin("", "http://localhost:3000").ok).toBe(false);
        expect(validateJoin("room-a", "").ok).toBe(false);
    });

    it("accepts trimmed valid join payload", () => {
        const result = validateJoin("  blue-fox  ", "  http://localhost:3000  ");
        expect(result).toEqual({
            ok: true,
            roomId: "blue-fox",
            partyUrl: "http://localhost:3000",
        });
    });

    it("rejects non-http party urls", () => {
        const result = validateJoin("room", "ftp://bad");
        expect(result.ok).toBe(false);
    });
});
