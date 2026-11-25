import type { PlayerQueueSnapshot } from "./player-queue";

export function confirmSingleTrackAutoplay(
    snapshot: PlayerQueueSnapshot,
    videoId: string,
    playlistId: string | null,
    autoplay: boolean | undefined,
    enable: () => void,
): boolean {
    if (!snapshot.available || playlistId !== null) return false;
    const explicit = snapshot.items.filter((item) => !item.id.startsWith("automix:"));
    if (explicit.length !== 1 || explicit[0].url !== videoId || !explicit[0].current) return false;
    if (autoplay === false) enable();
    return autoplay === true;
}

export function restoreRefreshPosition(
    position: number,
    video: Pick<HTMLVideoElement, "currentTime" | "duration" | "readyState"> | null,
): boolean {
    if (!Number.isFinite(position) || position <= 0) return true;
    if (!video || video.readyState < 1 || !Number.isFinite(video.duration)) return false;
    const target = Math.min(position, video.duration);
    if (video.currentTime + 0.25 < target) video.currentTime = target;
    return true;
}
