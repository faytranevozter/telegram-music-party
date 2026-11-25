import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountPartyControl } from "./browser";

function mount(action: "join" | "leave", label: string, onClick = vi.fn()) {
    return mountPartyControl({ action, label, onClick });
}

function addPlayerBar(height: number) {
    const bar = document.createElement("ytmusic-player-bar");
    bar.getBoundingClientRect = () => ({ height }) as DOMRect;
    document.body.append(bar);
    return bar;
}

describe("party control", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = "";
    });
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    it("keeps a single control when a content script mounts it twice", () => {
        mount("join", "Join Room");
        mount("leave", "Leave Room");

        const controls = document.querySelectorAll("#ytmp-party-control");
        expect(controls).toHaveLength(1);
        expect(controls[0].textContent).toBe("Leave Room");
    });

    it("drops sidebar entries left by earlier builds", () => {
        document.body.innerHTML = `
            <div id="guide">
                <tp-yt-paper-item><span>Leave Room</span></tp-yt-paper-item>
                <tp-yt-paper-item><span>Join Room</span></tp-yt-paper-item>
                <tp-yt-paper-item><span>Home</span></tp-yt-paper-item>
            </div>`;

        mount("leave", "Leave Room");

        const remaining = document.querySelectorAll("tp-yt-paper-item");
        expect(remaining).toHaveLength(1);
        expect(remaining[0].textContent).toBe("Home");
    });

    it("removes a sidebar entry added after mount by a stale script", async () => {
        mount("leave", "Leave Room");

        const stale = document.createElement("tp-yt-paper-item");
        stale.innerHTML = "<span>Leave Room</span>";
        document.body.append(stale);

        // The mounted control sweeps the guide after the page settles.
        await vi.advanceTimersByTimeAsync(1000);

        expect(document.querySelectorAll("tp-yt-paper-item")).toHaveLength(0);
        expect(document.querySelectorAll("#ytmp-party-control")).toHaveLength(1);
    });

    it("runs its handler on click", () => {
        const onClick = vi.fn();
        const control = mount("join", "Join Room", onClick);

        control.click();

        expect(onClick).toHaveBeenCalledOnce();
    });

    it("uses the extension palette with a single shared stylesheet", () => {
        mount("join", "Join Room");
        mount("leave", "Leave Room");

        const sheets = document.querySelectorAll("#ytmp-party-control-style");
        expect(sheets).toHaveLength(1);
        const control = document.querySelector<HTMLElement>(
            "#ytmp-party-control",
        )!;
        const palette = getComputedStyle(control);
        expect(palette.getPropertyValue("--ytmp-accent").trim()).toBe("#adc2ff");
        expect(palette.getPropertyValue("--ytmp-overlay-surface").replace(/\s/g, "")).toBe("rgba(21,25,34,0.92)");
        expect(palette.getPropertyValue("--ytmp-text").trim()).toBe("#f5f7fc");
    });

    it("sits at the viewport edge when there is no player bar", () => {
        const control = mount("join", "Join Room");

        expect(control.style.bottom).toBe("16px");
    });

    it("clears the player bar when one is visible", () => {
        addPlayerBar(72);

        const control = mount("leave", "Leave Room");

        expect(control.style.bottom).toBe("88px");
    });

    it("follows the player bar appearing after mount", async () => {
        const control = mount("leave", "Leave Room");
        expect(control.style.bottom).toBe("16px");

        addPlayerBar(72);
        await vi.advanceTimersByTimeAsync(500);

        expect(control.style.bottom).toBe("88px");
    });
});
