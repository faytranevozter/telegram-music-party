import { useCallback, useEffect, useState } from "react";
import {
    Button,
    Card,
    CardBody,
    Chip,
    Divider,
    Spinner,
} from "@heroui/react";
import type {
    BridgeResponse,
    ControlAction,
    PopupStatusMessage,
    QueueItem,
    SessionStatus,
} from "./shared/messages";
import {
    checkForUpdate,
    getCurrentVersion,
    type UpdateInfo,
} from "./lib/update";

type TabState = "loading" | "no-tab" | "ready";

const emptyStatus: SessionStatus = {
    connected: false,
    socketConnected: false,
    hasRoom: false,
    roomId: null,
    partyUrl: null,
    playback: null,
    queue: [],
};

async function findYoutubeMusicTab(): Promise<chrome.tabs.Tab | null> {
    const tabs = await chrome.tabs.query({
        url: ["https://music.youtube.com/*"],
    });
    if (tabs.length === 0) return null;

    const active = tabs.find((tab) => tab.active && tab.id != null);
    if (active?.id != null) return active;

    return tabs.find((tab) => tab.id != null) ?? null;
}

async function sendToTab(
    tabId: number,
    message:
        | { type: "GET_STATUS" }
        | { type: "CONTROL"; action: ControlAction }
        | { type: "LEAVE" },
): Promise<BridgeResponse> {
    return chrome.tabs.sendMessage(tabId, message) as Promise<BridgeResponse>;
}

function hostFromUrl(url: string | null): string {
    if (!url) return "—";
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

function truncate(value: string, max = 22): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max)}…`;
}

function connectionMeta(status: SessionStatus, tabState: TabState) {
    if (tabState === "no-tab") {
        return { label: "No tab", color: "default" as const };
    }
    if (status.connected) {
        return { label: "Connected", color: "success" as const };
    }
    if (status.hasRoom && !status.socketConnected) {
        return { label: "Disconnected", color: "danger" as const };
    }
    if (status.hasRoom) {
        return { label: "Connecting…", color: "warning" as const };
    }
    if (tabState === "ready") {
        return { label: "Not joined", color: "warning" as const };
    }
    return { label: "…", color: "default" as const };
}

function playbackChip(state: SessionStatus["playback"]) {
    if (!state) {
        return { label: "Unknown", color: "default" as const };
    }
    if (state.state === "playing") {
        return { label: "Playing", color: "success" as const };
    }
    if (state.state === "paused") {
        return { label: "Paused", color: "warning" as const };
    }
    return { label: "Standby", color: "default" as const };
}

function parseQueueLabel(item: QueueItem): { title: string; subtitle?: string } {
    const raw = item.title?.trim();
    if (!raw) {
        return { title: "Unknown track", subtitle: item.url };
    }

    const sep = raw.includes(" - ") ? " - " : raw.includes(" – ") ? " – " : null;
    if (sep) {
        const [title, ...rest] = raw.split(sep);
        const subtitle = rest.join(sep).trim();
        return {
            title: title.trim() || raw,
            subtitle: subtitle || undefined,
        };
    }

    return { title: raw };
}

function App() {
    const [tabState, setTabState] = useState<TabState>("loading");
    const [tabId, setTabId] = useState<number | null>(null);
    const [status, setStatus] = useState<SessionStatus>(emptyStatus);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [update, setUpdate] = useState<UpdateInfo | null>(null);
    const [updateChecking, setUpdateChecking] = useState(false);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const currentVersion = getCurrentVersion();

    const applyStatus = useCallback((next: SessionStatus) => {
        setStatus(next);
        setError(null);
    }, []);

    const refresh = useCallback(async () => {
        try {
            const tab = await findYoutubeMusicTab();
            if (!tab?.id) {
                setTabState("no-tab");
                setTabId(null);
                setStatus(emptyStatus);
                setError(null);
                return;
            }

            setTabId(tab.id);
            setTabState("ready");

            const response = await sendToTab(tab.id, { type: "GET_STATUS" });
            if (response.type === "STATUS") {
                applyStatus(response.status);
            } else if (response.type === "ERROR") {
                setError(response.message);
            }
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Could not reach YouTube Music tab",
            );
            setStatus(emptyStatus);
            setTabState((prev) => (prev === "loading" ? "no-tab" : prev));
        }
    }, [applyStatus]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        const onMessage = (message: PopupStatusMessage) => {
            if (message?.type !== "STATUS_PUSH" || !message.status) return;
            setTabState("ready");
            applyStatus(message.status);
        };

        chrome.runtime.onMessage.addListener(onMessage);
        return () => {
            chrome.runtime.onMessage.removeListener(onMessage);
        };
    }, [applyStatus]);

    const runUpdateCheck = useCallback(async () => {
        setUpdateChecking(true);
        setUpdateError(null);
        try {
            const info = await checkForUpdate();
            setUpdate(info);
        } catch (err) {
            setUpdateError(
                err instanceof Error ? err.message : "Could not check updates",
            );
        } finally {
            setUpdateChecking(false);
        }
    }, []);

    useEffect(() => {
        void runUpdateCheck();
    }, [runUpdateCheck]);

    const openDownload = async () => {
        const url = update?.downloadUrl ?? update?.releaseUrl;
        if (!url) return;
        await chrome.tabs.create({ url });
    };

    const openRelease = async () => {
        if (!update?.releaseUrl) return;
        await chrome.tabs.create({ url: update.releaseUrl });
    };



    const openYoutubeMusic = async () => {
        await chrome.tabs.create({ url: "https://music.youtube.com" });
        window.close();
    };

    const runControl = async (action: ControlAction) => {
        if (!tabId || busy) return;
        setBusy(true);
        try {
            const response = await sendToTab(tabId, {
                type: "CONTROL",
                action,
            });
            if (response.type === "ERROR") {
                setError(response.message);
            } else {
                setError(null);
            }
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Control failed",
            );
        } finally {
            setBusy(false);
        }
    };

    const leaveRoom = async () => {
        if (!tabId || busy) return;
        setBusy(true);
        try {
            const response = await sendToTab(tabId, { type: "LEAVE" });
            if (response.type === "ERROR") {
                setError(response.message);
            } else {
                setError(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Leave failed");
        } finally {
            setBusy(false);
        }
    };

    const isPlaying = status.playback?.state === "playing";
    const controlsDisabled =
        (!status.connected && !status.hasRoom) ||
        busy ||
        tabState !== "ready" ||
        !status.socketConnected;
    const conn = connectionMeta(status, tabState);
    const playChip = playbackChip(status.playback);
    const showNotJoined = tabState === "ready" && !status.hasRoom;
    const showDisconnected =
        tabState === "ready" && status.hasRoom && !status.socketConnected;

    return (
        <div className="dark w-[380px] min-h-[420px] bg-zinc-950 text-zinc-100 overflow-x-hidden">
            <div className="flex flex-col gap-3 p-4 box-border">
                <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-base font-semibold tracking-tight truncate">
                            YouTube Music Party
                        </h1>
                        <p className="text-xs text-zinc-400">
                            Session control center
                        </p>
                    </div>
                    <Chip
                        size="sm"
                        variant="flat"
                        className="shrink-0"
                        color={conn.color}
                    >
                        {conn.label}
                    </Chip>
                </header>

                {error && (
                    <Card className="bg-danger-50/10 border border-danger-400/30 shadow-none">
                        <CardBody className="py-2 text-xs text-danger-300">
                            {error}
                        </CardBody>
                    </Card>
                )}

                {tabState === "loading" && (
                    <div className="flex flex-1 items-center justify-center py-16">
                        <Spinner color="primary" />
                    </div>
                )}

                {tabState === "no-tab" && (
                    <Card className="bg-zinc-900 border border-zinc-800 shadow-none">
                        <CardBody className="gap-3">
                            <p className="text-sm text-zinc-300">
                                Open YouTube Music to control playback and join
                                a party room.
                            </p>
                            <Button
                                color="primary"
                                onPress={() => {
                                    void openYoutubeMusic();
                                }}
                            >
                                Open YouTube Music
                            </Button>
                        </CardBody>
                    </Card>
                )}

                {tabState === "ready" && (
                    <>
                        <Card className="bg-zinc-900 border border-zinc-800 shadow-none">
                            <CardBody className="gap-2 py-3">
                                <div className="flex items-center justify-between gap-3 text-xs">
                                    <span className="shrink-0 text-zinc-400">
                                        Room
                                    </span>
                                    <span
                                        className="min-w-0 truncate font-mono text-zinc-200"
                                        title={status.roomId ?? undefined}
                                    >
                                        {status.roomId
                                            ? truncate(status.roomId, 24)
                                            : "—"}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-xs">
                                    <span className="shrink-0 text-zinc-400">
                                        Party
                                    </span>
                                    <span className="min-w-0 truncate font-mono text-zinc-200">
                                        {hostFromUrl(status.partyUrl)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-xs">
                                    <span className="shrink-0 text-zinc-400">
                                        Socket
                                    </span>
                                    <span
                                        className={
                                            status.socketConnected
                                                ? "text-success"
                                                : "text-danger"
                                        }
                                    >
                                        {status.socketConnected
                                            ? "online"
                                            : "offline"}
                                    </span>
                                </div>
                            </CardBody>
                        </Card>

                        {showNotJoined && (
                            <Card className="bg-amber-500/10 border border-amber-500/30 shadow-none">
                                <CardBody className="gap-1 py-3">
                                    <p className="text-sm font-medium text-amber-200">
                                        Not in a room
                                    </p>
                                    <p className="text-xs text-amber-100/80 leading-relaxed">
                                        On YouTube Music, open the left sidebar
                                        and click <strong>Join Room</strong>.
                                        Enter the room ID from Telegram{" "}
                                        <code className="rounded bg-black/30 px-1">
                                            /register
                                        </code>
                                        .
                                    </p>
                                </CardBody>
                            </Card>
                        )}

                        {showDisconnected && (
                            <Card className="bg-danger-500/10 border border-danger-400/30 shadow-none">
                                <CardBody className="gap-1 py-3">
                                    <p className="text-sm font-medium text-danger-300">
                                        Server unreachable
                                    </p>
                                    <p className="text-xs text-danger-200/80 leading-relaxed">
                                        Room is configured but the party server
                                        is offline. Check that the backend is
                                        running at{" "}
                                        <span className="font-mono">
                                            {hostFromUrl(status.partyUrl)}
                                        </span>
                                        .
                                    </p>
                                </CardBody>
                            </Card>
                        )}

                        <Card className="bg-zinc-900 border border-zinc-800 shadow-none">
                            <CardBody className="gap-1 py-3">
                                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                                    Now playing
                                </p>
                                <p className="text-sm font-semibold leading-snug break-words">
                                    {status.playback?.song?.trim() ||
                                        "Nothing playing"}
                                </p>
                                <p className="text-xs text-zinc-400 break-words">
                                    {status.playback?.artist?.trim() || "—"}
                                </p>
                                <Chip
                                    size="sm"
                                    variant="dot"
                                    color={playChip.color}
                                    className="mt-1 w-fit"
                                >
                                    {playChip.label}
                                </Chip>
                            </CardBody>
                        </Card>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="flat"
                                    className="min-w-10 w-10 px-0"
                                    isDisabled={controlsDisabled}
                                    aria-label="Previous"
                                    onPress={() => {
                                        void runControl("prev");
                                    }}
                                >
                                    ⏮
                                </Button>
                                <Button
                                    size="sm"
                                    color="primary"
                                    className="flex-1 min-w-0"
                                    isDisabled={controlsDisabled}
                                    onPress={() => {
                                        void runControl(
                                            isPlaying ? "pause" : "play",
                                        );
                                    }}
                                >
                                    {isPlaying ? "Pause" : "Play"}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="flat"
                                    className="min-w-10 w-10 px-0"
                                    isDisabled={controlsDisabled}
                                    aria-label="Next"
                                    onPress={() => {
                                        void runControl("next");
                                    }}
                                >
                                    ⏭
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="flat"
                                    className="flex-1 min-w-0"
                                    isDisabled={controlsDisabled}
                                    onPress={() => {
                                        void runControl("volumeDown");
                                    }}
                                >
                                    Vol −
                                </Button>
                                <Button
                                    size="sm"
                                    variant="flat"
                                    className="flex-1 min-w-0"
                                    isDisabled={controlsDisabled}
                                    onPress={() => {
                                        void runControl("volumeUp");
                                    }}
                                >
                                    Vol +
                                </Button>
                                <Button
                                    size="sm"
                                    variant="bordered"
                                    className="flex-1 min-w-0"
                                    isDisabled={controlsDisabled}
                                    onPress={() => {
                                        void runControl("mute");
                                    }}
                                >
                                    Mute
                                </Button>
                            </div>
                        </div>

                        <Card className="bg-zinc-900 border border-zinc-800 shadow-none">
                            <CardBody className="gap-2 py-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                                        Queue
                                    </p>
                                    <span className="text-[10px] text-zinc-500 shrink-0">
                                        {status.queue.length} tracks
                                    </span>
                                </div>
                                {status.queue.length === 0 ? (
                                    <p className="text-xs text-zinc-500">
                                        Queue is empty. Add songs via Telegram.
                                    </p>
                                ) : (
                                    <ul className="max-h-36 space-y-2 overflow-y-auto pr-1">
                                        {status.queue.map((item, index) => {
                                            const label = parseQueueLabel(item);
                                            return (
                                                <li
                                                    key={item.id || item.url}
                                                    className="flex items-start gap-2 text-xs"
                                                >
                                                    <span className="w-4 shrink-0 pt-0.5 text-zinc-500 tabular-nums">
                                                        {index + 1}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate font-medium text-zinc-200">
                                                            {label.title}
                                                        </p>
                                                        {label.subtitle && (
                                                            <p className="truncate text-zinc-500">
                                                                {label.subtitle}
                                                            </p>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </CardBody>
                        </Card>

                        {status.hasRoom && (
                            <>
                                <Divider className="bg-zinc-800" />
                                <Button
                                    size="sm"
                                    color="danger"
                                    variant="flat"
                                    className="w-full"
                                    isDisabled={busy}
                                    onPress={() => {
                                        void leaveRoom();
                                    }}
                                >
                                    Leave room
                                </Button>
                            </>
                        )}
                    </>
                )}

                {update?.hasUpdate && (
                    <Card className="bg-primary-500/10 border border-primary-400/40 shadow-none rounded-xl">
                        <CardBody className="gap-2 py-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-primary-300">
                                    Update available
                                </p>
                                <Chip size="sm" color="primary" variant="flat">
                                    v{update.latestVersion}
                                </Chip>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                                You have v{update.currentVersion}. Unpacked
                                extensions cannot update themselves — follow
                                these steps after downloading:
                            </p>
                            <ol className="list-decimal pl-4 space-y-1 text-xs text-zinc-400 leading-relaxed">
                                <li>
                                    Click <strong className="text-zinc-300">Download ZIP</strong> and
                                    save the file.
                                </li>
                                <li>
                                    Extract the ZIP to a folder (replace the old
                                    folder or use a new one).
                                </li>
                                <li>
                                    Open{" "}
                                    <code className="rounded bg-black/30 px-1">
                                        chrome://extensions
                                    </code>
                                    .
                                </li>
                                <li>
                                    Enable <strong className="text-zinc-300">Developer mode</strong>{" "}
                                    (top-right).
                                </li>
                                <li>
                                    Click the reload icon on this extension, or{" "}
                                    <strong className="text-zinc-300">Load unpacked</strong> and
                                    select the extracted folder.
                                </li>
                            </ol>
                            <div className="flex gap-2 pt-1">
                                <Button
                                    size="sm"
                                    color="primary"
                                    className="flex-1"
                                    isDisabled={!update.downloadUrl && !update.releaseUrl}
                                    onPress={() => {
                                        void openDownload();
                                    }}
                                >
                                    Download ZIP
                                </Button>
                                <Button
                                    size="sm"
                                    variant="bordered"
                                    className="flex-1"
                                    onPress={() => {
                                        void openRelease();
                                    }}
                                >
                                    Release notes
                                </Button>
                            </div>
                        </CardBody>
                    </Card>
                )}

                <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-zinc-600">
                    <span>v{currentVersion}</span>
                    <button
                        type="button"
                        className="text-zinc-500 hover:text-zinc-300 underline-offset-2 hover:underline disabled:opacity-50"
                        disabled={updateChecking}
                        onClick={() => {
                            void runUpdateCheck();
                        }}
                    >
                        {updateChecking
                            ? "Checking…"
                            : update?.hasUpdate
                              ? "Recheck update"
                              : updateError
                                ? "Retry update check"
                                : "Check for updates"}
                    </button>
                </div>

                {updateError && (
                    <p className="text-center text-[10px] text-danger-400">
                        {updateError}
                    </p>
                )}

                {!update?.hasUpdate && update && !updateError && (
                    <p className="text-center text-[10px] text-zinc-600">
                        Up to date · latest v{update.latestVersion}
                    </p>
                )}

                <p className="text-center text-[10px] text-zinc-600">
                    Join / leave also available in the YT Music sidebar
                </p>
            </div>
        </div>
    );
}

export default App;
