import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PARTY_URL } from "../constants/config";
import { createJoinButton } from "./browser";

describe("sidebar join", () => {
    const reload = vi.fn();
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        document.body.innerHTML = "";
        vi.stubGlobal("window", { location: { reload } });
    });
    afterEach(() => {
        document.documentElement.removeAttribute("data-theme");
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        document.body.innerHTML = "";
    });

    async function openDialog() {
        createJoinButton();
        await vi.advanceTimersByTimeAsync(2000);
        document.querySelector<HTMLElement>("#ytmp-party-control")!.click();
        return document.querySelector<HTMLFormElement>(".ytmp-join-panel")!;
    }

    function submit(panel: HTMLFormElement, room: string, server: string) {
        document.querySelector<HTMLInputElement>("#ytmp-join-room")!.value = room;
        document.querySelector<HTMLInputElement>("#ytmp-join-server")!.value =
            server;
        panel.dispatchEvent(new Event("submit", { cancelable: true }));
    }

    it("opens an in-page dialog with the default server", async () => {
        await openDialog();

        expect(document.getElementById("ytmp-join-dialog")).not.toBeNull();
        expect(document.getElementById("ytmp-join-dialog")?.dataset.ytmpTheme).toBe("dark");
        expect(
            document.querySelector<HTMLInputElement>("#ytmp-join-server")!
                .value,
        ).toBe(DEFAULT_PARTY_URL);
    });

    it("matches live host theme changes in both the control and the open dialog", async () => {
        document.documentElement.setAttribute("data-theme", "light");
        await openDialog();
        const control = document.getElementById("ytmp-party-control")!;
        const dialog = document.getElementById("ytmp-join-dialog")!;
        expect(control.dataset.ytmpTheme).toBe("light");
        expect(dialog.dataset.ytmpTheme).toBe("light");
        document.documentElement.setAttribute("data-theme", "dark");
        await vi.advanceTimersByTimeAsync(0);
        expect(control.dataset.ytmpTheme).toBe("dark");
        expect(dialog.dataset.ytmpTheme).toBe("dark");
        expect(document.documentElement.dataset.ytmpTheme).toBeUndefined();
    });

    it("saves the trimmed configuration, closes, and reloads", async () => {
        const panel = await openDialog();
        submit(panel, " room-id ", " http://localhost:3000/custom ");

        expect(localStorage.getItem("roomId")).toBe("room-id");
        expect(localStorage.getItem("partyUrl")).toBe(
            "http://localhost:3000/custom",
        );
        expect(document.getElementById("ytmp-join-dialog")).toBeNull();
        expect(reload).toHaveBeenCalledOnce();
    });

    it("keeps the dialog open and explains an invalid server", async () => {
        const panel = await openDialog();
        submit(panel, "room-id", "not a url");

        expect(localStorage.getItem("roomId")).toBeNull();
        expect(reload).not.toHaveBeenCalled();
        expect(document.getElementById("ytmp-join-dialog")).not.toBeNull();
        expect(document.getElementById("ytmp-join-error")!.textContent).toContain(
            "HTTP(S)",
        );
    });

    it("closes on Escape", async () => {
        await openDialog();

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

        expect(document.getElementById("ytmp-join-dialog")).toBeNull();
    });
});
