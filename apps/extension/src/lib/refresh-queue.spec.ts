import { describe, expect, it } from "vitest";
import { confirmSingleTrackAutoplay, restoreRefreshPosition } from "./refresh-queue";

describe("confirmSingleTrackAutoplay", () => {
    const current = { id: "0:track", url: "track", title: "Track", artist: "", current: true };
    const recommendation = { ...current, id: "automix:0:other", url: "other", current: false };
    const snapshot = { available: true, items: [current, recommendation] };

    it("enables autoplay for a single track and waits for the player to confirm it", () => {
        let autoplay = false;
        const enable = () => { autoplay = true; };
        expect(confirmSingleTrackAutoplay(snapshot, "track", null, autoplay, enable)).toBe(false);
        expect(confirmSingleTrackAutoplay(snapshot, "track", null, autoplay, enable)).toBe(true);
    });

    it("does not treat a mix or an explicit second track as single-track autoplay", () => {
        const enable = () => { throw new Error("must not toggle autoplay"); };
        expect(confirmSingleTrackAutoplay(snapshot, "track", "RDAMVMtrack", true, enable)).toBe(false);
        expect(confirmSingleTrackAutoplay({ ...snapshot, items: [current, { ...recommendation, id: "1:other" }] }, "track", null, false, enable)).toBe(false);
    });
});

describe("restoreRefreshPosition", () => {
    const media = () => ({ currentTime: 0, duration: 180, readyState: 1 });

    it("restores the exact position on the refreshed media", () => {
        const video = media();
        expect(restoreRefreshPosition(83.75, video)).toBe(true);
        expect(video.currentTime).toBe(83.75);
    });

    it("waits for the refreshed media to load before seeking", () => {
        const video = { ...media(), readyState: 0 };
        expect(restoreRefreshPosition(83, video)).toBe(false);
        expect(video.currentTime).toBe(0);
    });

    it.each([0, -1, NaN, Infinity])("does not seek for an unusable offset (%s)", (position) => {
        const video = media();
        expect(restoreRefreshPosition(position, video)).toBe(true);
        expect(video.currentTime).toBe(0);
    });
});
