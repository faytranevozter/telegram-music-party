import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendToTab, waitForTabStatus } from "./popup-bridge";

describe("popup bridge readiness", () => {
    const sendMessage = vi.fn();
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("chrome", { tabs: { sendMessage } });
    });
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("forwards JOIN_ROOM with its configuration", async () => {
        sendMessage.mockResolvedValue({ type: "OK" });
        const request = { type: "JOIN_ROOM" as const, roomId: "room", partyUrl: "http://localhost:3010/path" };
        await sendToTab(42, request);
        expect(sendMessage).toHaveBeenCalledWith(42, request);
    });

    it("recovers across reload, then stops requesting status", async () => {
        sendMessage.mockRejectedValueOnce(new Error("No receiver"))
            .mockResolvedValueOnce({ type: "ERROR", message: "Bridge not ready" })
            .mockResolvedValue({ type: "STATUS", status: { connected: true } });
        const pending = waitForTabStatus(42, new AbortController().signal);
        await vi.runAllTimersAsync();
        expect(await pending).toEqual({ connected: true });
        expect(sendMessage).toHaveBeenCalledTimes(3);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("bounds unavailable-bridge retries and provides recovery guidance", async () => {
        sendMessage.mockRejectedValue(new Error("No receiver"));
        const result = expect(waitForTabStatus(42, new AbortController().signal)).rejects.toThrow("Reload that tab");
        await vi.runAllTimersAsync();
        await result;
        expect(sendMessage).toHaveBeenCalledTimes(8);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("cancels popup readiness timers when closed", async () => {
        sendMessage.mockRejectedValue(new Error("No receiver"));
        const controller = new AbortController();
        const pending = waitForTabStatus(42, controller.signal);
        await vi.advanceTimersByTimeAsync(0);
        controller.abort();
        expect(await pending).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        expect(sendMessage).toHaveBeenCalledTimes(1);
    });
});
