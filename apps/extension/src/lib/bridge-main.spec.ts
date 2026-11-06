import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";
import { getBridgeSession, setBridgeSession, startMainBridge } from "./bridge-main";
import type { BridgeRequest } from "../shared/messages";
import { YTMP_BRIDGE } from "../shared/messages";

vi.mock("./playback", () => ({ getPlaybackState: () => ({ state: "standby" }) }));
vi.mock("./player-queue", () => ({ readPlayerQueue: () => ({ items: [], available: false }) }));

describe("MAIN room join boundary", () => {
    const postMessage = vi.fn();
    const reload = vi.fn();
    const reloadScheduled = () => vi.mocked(setTimeout).mock.calls.some((call) => call[1] === 200);
    let listener: (event: unknown) => void;
    const request = (data: BridgeRequest | object) => {
        listener({ source: window, data: { source: YTMP_BRIDGE, id: "request-1", ...data } });
        return postMessage.mock.calls.at(-1)?.[0];
    };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(globalThis, "setTimeout");
        localStorage.clear();
        vi.stubGlobal("window", {
            postMessage,
            location: { reload },
            addEventListener: (_type: string, handler: typeof listener) => { listener = handler; },
        });
        setBridgeSession({ socket: null, roomId: null, partyUrl: null, joined: false, joinRejected: false, queues: [] });
        postMessage.mockClear();
        startMainBridge();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it.each([
        ["", "https://music.ytparty.my.id"],
        ["  ", "http://localhost:3000"],
        ["room", "not a url"],
        ["room", "javascript:alert(1)"],
        ["room", "ftp://localhost"],
        [null, "https://example.com"],
        ["room", null],
    ])("rejects invalid input without persistence: %s / %s", (roomId, partyUrl) => {
        expect(request({ type: "JOIN_ROOM", roomId, partyUrl }).type).toBe("ERROR");
        expect(localStorage.getItem("roomId")).toBeNull();
        expect(localStorage.getItem("partyUrl")).toBeNull();
        expect(reload).not.toHaveBeenCalled();
        expect(reloadScheduled()).toBe(false);
    });

    it.each(["https://music.ytparty.my.id", "http://localhost:3010/custom/path", "https://party.example:8443/namespace/"])("persists trimmed configuration and acknowledges before scheduling reload: %s", (partyUrl) => {
        expect(request({ type: "JOIN_ROOM", roomId: " room-123 ", partyUrl: ` ${partyUrl} ` })).toMatchObject({ type: "OK", id: "request-1" });
        expect(localStorage.getItem("roomId")).toBe("room-123");
        expect(localStorage.getItem("partyUrl")).toBe(partyUrl);
        expect(getBridgeSession().joined).toBe(false);
        expect(reload).not.toHaveBeenCalled();
        expect(reloadScheduled()).toBe(true);
        const scheduleIndex = vi.mocked(setTimeout).mock.calls.findIndex((call) => call[1] === 200);
        expect(postMessage.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(setTimeout).mock.invocationCallOrder[scheduleIndex]);
        vi.advanceTimersByTime(200);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(postMessage.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
    });

    it("requires leaving an admitted room before changing configuration", () => {
        localStorage.setItem("roomId", "original");
        setBridgeSession({ joined: true, roomId: "original" });
        expect(request({ type: "JOIN_ROOM", roomId: "another", partyUrl: "http://localhost:3000" })).toMatchObject({ type: "ERROR", message: expect.stringContaining("Leave") });
        expect(localStorage.getItem("roomId")).toBe("original");
        expect(reloadScheduled()).toBe(false);
    });

    it("keeps payload-free JOIN retry compatible and does not reload", () => {
        localStorage.setItem("roomId", "saved");
        const emit = vi.fn();
        setBridgeSession({ socket: { connected: true, emit } as unknown as Socket, joinRejected: true });
        expect(request({ type: "JOIN" }).type).toBe("OK");
        expect(emit).toHaveBeenCalledWith("join", expect.objectContaining({ id: "saved", fingerprint: expect.any(String) }));
        expect(getBridgeSession().joinRejected).toBe(false);
        expect(reloadScheduled()).toBe(false);
    });

    it("keeps missing-room and offline retry errors", () => {
        expect(request({ type: "JOIN" }).type).toBe("ERROR");
        localStorage.setItem("roomId", "saved");
        expect(request({ type: "JOIN" })).toMatchObject({ type: "ERROR", message: "Server unreachable" });
    });

    it("acknowledges leave, clears config and permits a different join", () => {
        localStorage.setItem("roomId", "original");
        localStorage.setItem("partyUrl", "https://example.com");
        setBridgeSession({ roomId: "original", joined: true });
        expect(request({ type: "LEAVE" }).type).toBe("OK");
        expect(localStorage.getItem("roomId")).toBeNull();
        expect(localStorage.getItem("partyUrl")).toBeNull();
        expect(reload).not.toHaveBeenCalled();
        vi.advanceTimersByTime(200);
        expect(request({ type: "JOIN_ROOM", roomId: "another", partyUrl: "http://localhost:3000" }).type).toBe("OK");
    });
});
