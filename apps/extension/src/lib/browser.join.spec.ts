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
        expect(
            document.querySelector<HTMLInputElement>("#ytmp-join-server")!
                .value,
        ).toBe(DEFAULT_PARTY_URL);
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