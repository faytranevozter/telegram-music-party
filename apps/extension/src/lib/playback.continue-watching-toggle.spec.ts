import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    BYPASS_CONTINUE_WATCHING_KEY,
    isContinueWatchingBypassEnabled,
    setContinueWatchingBypass,
} from "../constants/config";
import {
    applyContinueWatchingSetting,
    dismissContinueWatching,
    play,
    startContinueWatchingWatcher,
    startIdleKeepAlive,
    stopContinueWatchingWatcher,
    stopIdleKeepAlive,
} from "./playback";

type LactWindow = Window & { _lact?: number };

function mountContinueDialog() {
    const app = document.createElement("ytmusic-app");
    const dialog = document.createElement("tp-yt-paper-dialog");

    const title = document.createElement("div");
    title.textContent = "Video paused. Continue watching?";
    dialog.appendChild(title);

    const confirm = document.createElement("button");
    confirm.textContent = "Yes";
    confirm.setAttribute("aria-label", "Yes");
    const confirmClick = vi.fn();
    confirm.addEventListener("click", confirmClick);

    dialog.appendChild(confirm);
    app.appendChild(dialog);
    document.body.appendChild(app);

    return { confirmClick };
}

describe("continue watching bypass setting", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = "";
        localStorage.removeItem(BYPASS_CONTINUE_WATCHING_KEY);
        delete (window as LactWindow)._lact;
        stopIdleKeepAlive();
        stopContinueWatchingWatcher();
    });

    afterEach(() => {
        stopIdleKeepAlive();
        stopContinueWatchingWatcher();
        vi.useRealTimers();
        document.body.innerHTML = "";
        localStorage.removeItem(BYPASS_CONTINUE_WATCHING_KEY);
        delete (window as LactWindow)._lact;
    });

    it("defaults to enabled when the key is unset", () => {
        expect(localStorage.getItem(BYPASS_CONTINUE_WATCHING_KEY)).toBeNull();
        expect(isContinueWatchingBypassEnabled()).toBe(true);

        const { confirmClick } = mountContinueDialog();
        expect(dismissContinueWatching()).toBe(true);
        expect(confirmClick).toHaveBeenCalledTimes(1);
    });

    it("persists explicit true/false values", () => {
        setContinueWatchingBypass(false);
        expect(localStorage.getItem(BYPASS_CONTINUE_WATCHING_KEY)).toBe(
            "false",
        );
        expect(isContinueWatchingBypassEnabled()).toBe(false);

        setContinueWatchingBypass(true);
        expect(localStorage.getItem(BYPASS_CONTINUE_WATCHING_KEY)).toBe(
            "true",
        );
        expect(isContinueWatchingBypassEnabled()).toBe(true);
    });

    it("dismissContinueWatching is inert when disabled", () => {
        setContinueWatchingBypass(false);

        const { confirmClick } = mountContinueDialog();
        expect(dismissContinueWatching()).toBe(false);
        expect(confirmClick).not.toHaveBeenCalled();
    });

    it("play() does not dismiss the dialog when disabled", () => {
        setContinueWatchingBypass(false);

        const { confirmClick } = mountContinueDialog();
        play();
        expect(confirmClick).not.toHaveBeenCalled();
    });

    it("startIdleKeepAlive does not set _lact when disabled", () => {
        setContinueWatchingBypass(false);

        startIdleKeepAlive();
        expect((window as LactWindow)._lact).toBeUndefined();

        vi.advanceTimersByTime(120_000);
        expect((window as LactWindow)._lact).toBeUndefined();
    });

    it("watcher does not dismiss dialogs when disabled", async () => {
        setContinueWatchingBypass(false);

        startContinueWatchingWatcher();
        const { confirmClick } = mountContinueDialog();

        await vi.advanceTimersByTimeAsync(300);

        expect(confirmClick).not.toHaveBeenCalled();
        expect((window as LactWindow)._lact).toBeUndefined();
    });

    it("applyContinueWatchingSetting stops everything when toggled off", async () => {
        applyContinueWatchingSetting();
        expect((window as LactWindow)._lact).toBeTypeOf("number");

        setContinueWatchingBypass(false);
        applyContinueWatchingSetting();

        const frozen = (window as LactWindow)._lact!;
        vi.advanceTimersByTime(120_000);
        expect((window as LactWindow)._lact).toBe(frozen);

        const { confirmClick } = mountContinueDialog();
        await vi.advanceTimersByTimeAsync(300);
        expect(confirmClick).not.toHaveBeenCalled();
    });

    it("applyContinueWatchingSetting starts everything when toggled on live", async () => {
        setContinueWatchingBypass(false);
        applyContinueWatchingSetting();
        expect((window as LactWindow)._lact).toBeUndefined();

        setContinueWatchingBypass(true);
        applyContinueWatchingSetting();

        expect((window as LactWindow)._lact).toBeTypeOf("number");

        const { confirmClick } = mountContinueDialog();
        await vi.advanceTimersByTimeAsync(300);
        expect(confirmClick).toHaveBeenCalledTimes(1);
    });
});
