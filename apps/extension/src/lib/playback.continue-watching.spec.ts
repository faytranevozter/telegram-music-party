import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    dismissContinueWatching,
    pause,
    play,
    startContinueWatchingWatcher,
    startIdleKeepAlive,
    stopContinueWatchingWatcher,
    stopIdleKeepAlive,
} from "./playback";

type LactWindow = Window & { _lact?: number };

function mountVideo(paused = true) {
    const container = document.createElement("div");
    container.id = "movie_player";
    container.innerHTML = `<div class="html5-video-container"><video></video></div>`;
    document.body.appendChild(container);

    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "src", {
        configurable: true,
        get: () => "blob:mock",
        set: () => undefined,
    });
    Object.defineProperty(video, "paused", {
        configurable: true,
        get: () => paused,
    });

    const playMock = vi.fn().mockResolvedValue(undefined);
    video.play = playMock;
    video.pause = vi.fn();

    return { video, playMock, setPaused: (value: boolean) => {
        paused = value;
    } };
}

function mountContinueDialog(options?: {
    hidden?: boolean;
    confirmLabel?: string;
    includeCancel?: boolean;
}) {
    const app = document.createElement("ytmusic-app");
    const dialog = document.createElement("tp-yt-paper-dialog");
    if (options?.hidden) {
        dialog.setAttribute("aria-hidden", "true");
        dialog.style.display = "none";
    }

    const title = document.createElement("div");
    title.textContent = "Video paused. Continue watching?";
    dialog.appendChild(title);

    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.setAttribute("aria-label", "Cancel");
    const cancelClick = vi.fn();
    cancel.addEventListener("click", cancelClick);

    const confirm = document.createElement("button");
    confirm.textContent = options?.confirmLabel ?? "Yes";
    confirm.setAttribute("aria-label", options?.confirmLabel ?? "Yes");
    const confirmClick = vi.fn();
    confirm.addEventListener("click", confirmClick);

    if (options?.includeCancel !== false) {
        dialog.appendChild(cancel);
    }
    dialog.appendChild(confirm);
    app.appendChild(dialog);
    document.body.appendChild(app);

    return { app, dialog, confirm, cancel, confirmClick, cancelClick };
}

describe("continue watching keep-alive + dismisser", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = "";
        delete (window as LactWindow)._lact;
        stopIdleKeepAlive();
        stopContinueWatchingWatcher();
    });

    afterEach(() => {
        stopIdleKeepAlive();
        stopContinueWatchingWatcher();
        vi.useRealTimers();
        document.body.innerHTML = "";
        delete (window as LactWindow)._lact;
    });

    it("sets window._lact immediately and refreshes on interval", () => {
        const before = Date.now();
        startIdleKeepAlive();

        expect((window as LactWindow)._lact).toBeTypeOf("number");
        expect((window as LactWindow)._lact!).toBeGreaterThanOrEqual(before);

        const first = (window as LactWindow)._lact!;
        vi.setSystemTime(first + 60_000);
        vi.advanceTimersByTime(60_000);

        expect((window as LactWindow)._lact!).toBeGreaterThan(first);
    });

    it("dismisses a visible continue-watching dialog via Yes button", () => {
        const { confirmClick, cancelClick } = mountContinueDialog();

        expect(dismissContinueWatching()).toBe(true);
        expect(confirmClick).toHaveBeenCalledTimes(1);
        expect(cancelClick).not.toHaveBeenCalled();
    });

    it("ignores hidden continue-watching dialogs", () => {
        const { confirmClick } = mountContinueDialog({ hidden: true });

        expect(dismissContinueWatching()).toBe(false);
        expect(confirmClick).not.toHaveBeenCalled();
    });

    it("ignores unrelated dialogs", () => {
        const app = document.createElement("ytmusic-app");
        const dialog = document.createElement("tp-yt-paper-dialog");
        dialog.textContent = "Delete playlist?";
        const ok = document.createElement("button");
        ok.textContent = "Yes";
        const okClick = vi.fn();
        ok.addEventListener("click", okClick);
        dialog.appendChild(ok);
        app.appendChild(dialog);
        document.body.appendChild(app);

        expect(dismissContinueWatching()).toBe(false);
        expect(okClick).not.toHaveBeenCalled();
    });

    it("watcher auto-dismisses when dialog is inserted", async () => {
        startContinueWatchingWatcher();
        const { confirmClick } = mountContinueDialog({
            confirmLabel: "Continue",
        });

        await vi.advanceTimersByTimeAsync(300);

        expect(confirmClick).toHaveBeenCalledTimes(1);
    });

    it("does not auto-resume after dismiss when pause was intentional", async () => {
        const { playMock, setPaused } = mountVideo(true);
        pause();
        setPaused(true);

        startContinueWatchingWatcher();
        mountContinueDialog();

        await vi.advanceTimersByTimeAsync(300);

        expect(playMock).not.toHaveBeenCalled();
    });

    it("auto-resumes after dismiss when not intentionally paused", async () => {
        const { playMock, setPaused } = mountVideo(true);
        play();
        setPaused(true);

        startContinueWatchingWatcher();
        mountContinueDialog();

        await vi.advanceTimersByTimeAsync(300);

        expect(playMock).toHaveBeenCalled();
    });
});
