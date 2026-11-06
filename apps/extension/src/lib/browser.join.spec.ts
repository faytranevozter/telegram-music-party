import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJoinButton } from "./browser";

describe("sidebar join", () => {
    const reload = vi.fn();
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        document.body.innerHTML = '<div class="scroller scroller-on-hover style-scope ytmusic-guide-section-renderer"></div>';
        vi.stubGlobal("window", { location: { reload } });
        vi.stubGlobal("alert", vi.fn());
    });
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        document.body.innerHTML = "";
    });
    async function join(room: string, server: string) {
        vi.stubGlobal("prompt", vi.fn().mockReturnValueOnce(room).mockReturnValueOnce(server));
        createJoinButton();
        await vi.advanceTimersByTimeAsync(2000);
        document.querySelector<HTMLElement>("tp-yt-paper-item")!.click();
    }
    it("still saves and reloads using the shared validator", async () => {
        await join(" room-id ", " http://localhost:3000/custom ");
        expect(localStorage.getItem("roomId")).toBe("room-id");
        expect(localStorage.getItem("partyUrl")).toBe("http://localhost:3000/custom");
        expect(reload).toHaveBeenCalledOnce();
    });
    it("does not persist invalid configuration", async () => {
        await join("room-id", "not a url");
        expect(localStorage.getItem("roomId")).toBeNull();
        expect(reload).not.toHaveBeenCalled();
        expect(alert).toHaveBeenCalledWith(expect.stringContaining("HTTP(S)"));
    });
});
