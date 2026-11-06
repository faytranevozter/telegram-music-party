import { useCallback, useEffect, useRef, useState } from "react";
import {
    Button,
    Card,
    CardBody,
    Chip,
    Divider,
    Spinner,
    Switch,
} from "@heroui/react";
import type {
    ControlAction,
    PopupStatusMessage,
    QueueItem,
    SessionStatus,
} from "./shared/messages";

import { splitQueue } from "./lib/player-queue";
import { DEFAULT_PARTY_URL, validateRoomConfig } from "./constants/config";
import { sendToTab, waitForTabStatus } from "./lib/popup-bridge";
type TabState = "loading" | "no-tab" | "ready";

const emptyStatus: SessionStatus = {
    connected: false,
    socketConnected: false,
    hasRoom: false,
    joinRejected: false,
    roomId: null,
    partyUrl: null,
    playback: null,
    queue: [],
    queueAvailable: false,
    userQueue: [],
    bypassContinueWatching: true,
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
    if (status.joinRejected) {
        return { label: "Room busy", color: "warning" as const };
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
    if (item.artist !== undefined) {
        return { title: item.title || "Unknown track", subtitle: item.artist };
    }
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
    const [roomIdInput, setRoomIdInput] = useState("");
    const [partyUrlInput, setPartyUrlInput] = useState(DEFAULT_PARTY_URL);
    const [connecting, setConnecting] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [admissionTimedOut, setAdmissionTimedOut] = useState(false);
    const selectedTab = useRef<number | null>(null);
    const formEdited = useRef({ roomId: false, partyUrl: false });
    const submitting = useRef(false);
    const recovery = useRef<AbortController | null>(null);
    const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mounted = useRef(false);
    const currentVersion = chrome.runtime.getManifest().version;

    const applyStatus = useCallback((next: SessionStatus) => {
        setStatus(next);
        if (!formEdited.current.roomId) {
            setRoomIdInput(next.roomId ?? "");
        }
        if (!formEdited.current.partyUrl) {
            setPartyUrlInput(next.partyUrl || DEFAULT_PARTY_URL);
        }
        if (next.connected || next.joinRejected) {
            setConnecting(false);
            setAdmissionTimedOut(false);
            setError(null);
        }
    }, []);

    const recoverBridge = useCallback(async (id: number) => {
        recovery.current?.abort();
        const controller = new AbortController();
        recovery.current = controller;
        try {
            const next = await waitForTabStatus(id, controller.signal);
            if (next && selectedTab.current === id) applyStatus(next);
        } catch (err) {
            if (!controller.signal.aborted) {
                setConnecting(false);
                setError(
                    err instanceof Error
                        ? err.message
                        : "Could not reach YouTube Music. Reload the tab and retry connection.",
                );
            }
        }
    }, [applyStatus]);

    const recoverAfterReload = (id: number) => {
        if (!mounted.current) return;
        recovery.current?.abort();
        if (reloadTimer.current) clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => {
            void recoverBridge(id);
        }, 750);
    };

    const refresh = useCallback(async () => {
        try {
            const tab = await findYoutubeMusicTab();
            if (!mounted.current) return;
            if (tab?.id == null) {
                setTabState("no-tab");
                setTabId(null);
                selectedTab.current = null;
                setStatus(emptyStatus);
                setError(null);
                return;
            }

            setTabId(tab.id);
            selectedTab.current = tab.id;
            setTabState("ready");
            await recoverBridge(tab.id);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Could not reach YouTube Music tab",
            );
            setStatus(emptyStatus);
            setTabState((prev) => (prev === "loading" ? "no-tab" : prev));
        }
    }, [recoverBridge]);

    useEffect(() => {
        mounted.current = true;
        void refresh();
        return () => {
            mounted.current = false;
            recovery.current?.abort();
            if (reloadTimer.current) clearTimeout(reloadTimer.current);
        };
    }, [refresh]);

    useEffect(() => {
        if (
            admissionTimedOut ||
            status.connected ||
            status.joinRejected ||
            (!status.hasRoom && !connecting)
        ) return;
        const timer = setTimeout(() => {
            setConnecting(false);
            setAdmissionTimedOut(true);
            setError("Room admission was not confirmed. Check the room ID and server, then retry join or edit the configuration below.");
        }, 30000);
        return () => clearTimeout(timer);
    }, [status.connected, status.joinRejected, status.hasRoom, connecting, attempt, admissionTimedOut]);

    useEffect(() => {
        const onMessage = (
            message: PopupStatusMessage,
            sender: chrome.runtime.MessageSender,
        ) => {
            if (message?.type !== "STATUS_PUSH" || !message.status) return;
            if (sender.tab?.id !== selectedTab.current) return;
            setTabState("ready");
            applyStatus(message.status);
        };

        chrome.runtime.onMessage.addListener(onMessage);
        return () => {
            chrome.runtime.onMessage.removeListener(onMessage);
        };
    }, [applyStatus]);

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
                setConnecting(false);
                setAdmissionTimedOut(false);
                setStatus(emptyStatus);
                recoverAfterReload(tabId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Leave failed");
        } finally {
            setBusy(false);
        }
    };

    const retryJoin = async () => {
        if (!tabId || busy) return;
        setBusy(true);
        try {
            const response = await sendToTab(tabId, { type: "JOIN" });
            if (response.type === "ERROR") {
                setError(response.message);
            } else {
                setError(null);
                setAdmissionTimedOut(false);
                setAttempt((value) => value + 1);
                // JOIN retries the saved session; it is not a new configuration.
                setStatus((previous) => ({ ...previous, joinRejected: false }));
                setConnecting(true);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Join failed");
        } finally {
            setBusy(false);
        }
    };

    const joinRoom = async () => {
        if (tabId == null || submitting.current || busy || connecting) return;
        let config: ReturnType<typeof validateRoomConfig>;
        try {
            config = validateRoomConfig(roomIdInput, partyUrlInput);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Check the room ID and party URL.");
            return;
        }
        submitting.current = true;
        setBusy(true);
        setError(null);
        try {
            const response = await sendToTab(tabId, { type: "JOIN_ROOM", ...config });
            if (response.type === "ERROR") {
                setError(response.message);
                return;
            }
            setAdmissionTimedOut(false);
            setConnecting(true);
            setAttempt((value) => value + 1);
            // Acknowledgement means saved, not admitted. Wait for the reloaded page.
            recoverAfterReload(tabId);
        } catch {
            setError("Could not reach YouTube Music. Reload the tab, then retry connection. Your entries are kept here.");
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    };

    const setBypassContinueWatching = async (enabled: boolean) => {
        if (!tabId || busy) return;
        setBusy(true);
        // optimistic; STATUS_PUSH confirms, revert on failure
        setStatus((prev) => ({ ...prev, bypassContinueWatching: enabled }));
        try {
            const response = await sendToTab(tabId, {
                type: "SET_CONTINUE_WATCHING_BYPASS",
                enabled,
            });
            if (response.type === "ERROR") {
                setError(response.message);
                setStatus((prev) => ({
                    ...prev,
                    bypassContinueWatching: !enabled,
                }));
            } else {
                setError(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Setting failed");
            setStatus((prev) => ({
                ...prev,
                bypassContinueWatching: !enabled,
            }));
        } finally {
            setBusy(false);
        }
    };

    const isPlaying = status.playback?.state === "playing";
    const queueGroups = splitQueue(status.queue, status.userQueue ?? []);
    const controlsDisabled =
        (!status.connected && !status.hasRoom) ||
        status.joinRejected ||
        busy ||
        tabState !== "ready" ||
        !status.socketConnected;
    const conn = connecting
        ? { label: "Connecting…", color: "warning" as const }
        : connectionMeta(status, tabState);
    const playChip = playbackChip(status.playback);
    const showJoinForm = tabState === "ready" && !status.connected;
    const showJoinRejected = tabState === "ready" && status.joinRejected;
    const showDisconnected =
        tabState === "ready" &&
        status.hasRoom &&
        !status.joinRejected &&
        !status.socketConnected &&
        !connecting;

    return (
        <div className="dark party-popup">
            <div className="popup-layout">
                <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="popup-brand">
                            <img src="/app-icon.png" width="28" height="28" alt="" />
                            YouTube Music Party
                        </h1>
                        <p className="text-xs text-zinc-400">
                            The group’s music, your player.
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
                        <CardBody className="gap-2 py-2 text-xs text-danger-300">
                            <p role="alert">{error}</p>
                            <Button
                                size="sm"
                                variant="flat"
                                isDisabled={busy || connecting}
                                onPress={() => {
                                    setError(null);
                                    if (tabId != null) void recoverBridge(tabId);
                                    else void refresh();
                                }}
                            >
                                Retry connection
                            </Button>
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
                                a party room. Once it loads, reopen this popup to join.
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
                        <Card className="session-details bg-zinc-900 border border-zinc-800 shadow-none">
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

                        {showJoinForm && (
                            <Card className="bg-zinc-900 border border-zinc-800 shadow-none">
                                <CardBody className="gap-3 py-3">
                                    <form
                                        noValidate
                                        className="flex flex-col gap-3"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            void joinRoom();
                                        }}
                                    >
                                        <label className="join-field">
                                            <span>Room ID</span>
                                        <input
                                            aria-label="Room ID"
                                            placeholder="From Telegram /register"
                                            required
                                            value={roomIdInput}
                                            disabled={busy || connecting}
                                            onChange={(event) => {
                                                formEdited.current.roomId = true;
                                                setRoomIdInput(event.target.value);
                                            }}
                                        />
                                        </label>
                                        <details>
                                            <summary className="cursor-pointer text-xs text-zinc-400">Advanced / custom server</summary>
                                            <label className="join-field join-server-field">
                                                <span>Party server URL</span>
                                            <input
                                                aria-label="Party server URL"
                                                type="url"
                                                required
                                                value={partyUrlInput}
                                                disabled={busy || connecting}
                                                onChange={(event) => {
                                                    formEdited.current.partyUrl = true;
                                                    setPartyUrlInput(event.target.value);
                                                }}
                                            />
                                            </label>
                                        </details>
                                        <p className="text-xs text-zinc-400 leading-relaxed">Joining refreshes the YouTube Music tab and may briefly interrupt playback.</p>
                                        <Button
                                            type="submit"
                                            color="primary"
                                            size="sm"
                                            isLoading={connecting || busy}
                                            isDisabled={busy || connecting || !roomIdInput.trim() || !partyUrlInput.trim()}
                                        >
                                            {connecting ? "Connecting…" : "Join Room"}
                                        </Button>
                                        {connecting && <p role="status" className="text-xs text-zinc-400">Waiting for room admission. You can close this popup; joining will continue.</p>}
                                    </form>
                                </CardBody>
                            </Card>
                        )}

                        {showJoinRejected && (
                            <Card className="bg-amber-500/10 border border-amber-500/30 shadow-none">
                                <CardBody className="gap-2 py-3">
                                    <p className="text-sm font-medium text-amber-200">
                                        Room is busy
                                    </p>
                                    <p className="text-xs text-amber-100/80 leading-relaxed">
                                        Another device is already playing in
                                        this room. Only one player can be
                                        connected at a time — leave the room on
                                        that device first, then retry.
                                    </p>
                                    <Button
                                        size="sm"
                                        variant="flat"
                                        className="w-fit"
                                        isDisabled={busy || connecting}
                                        onPress={() => {
                                            void retryJoin();
                                        }}
                                    >
                                        Retry join
                                    </Button>
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
                                        cannot be reached yet. Check that the backend is
                                        running at{" "}
                                        <span className="font-mono">
                                            {hostFromUrl(status.partyUrl)}
                                        </span>
                                        .
                                    </p>
                                    <Button size="sm" variant="flat" isDisabled={busy} onPress={() => { void retryJoin(); }}>Retry join</Button>
                                </CardBody>
                            </Card>
                        )}

                        {admissionTimedOut && status.hasRoom && status.socketConnected && !status.connected && (
                            <Button size="sm" variant="flat" isDisabled={busy || connecting} onPress={() => { void retryJoin(); }}>Retry join</Button>
                        )}

                        <Card className="now-playing bg-zinc-900 border border-zinc-800 shadow-none">
                            <CardBody className="gap-1 py-3">
                                <p className="track-label">
                                    Now playing
                                </p>
                                <p className="track-title">
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

                        <div className="transport flex flex-col gap-2">
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

                        <Card className="queue-panel bg-zinc-900 border border-zinc-800 shadow-none">
                            <CardBody className="gap-2 py-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="queue-heading">
                                        YouTube Music queue
                                    </p>
                                    <span className="text-[10px] text-zinc-500 shrink-0">
                                        {status.queue.length} tracks
                                    </span>
                                </div>
                                {!status.queueAvailable ? (
                                    <p className="text-xs text-zinc-500">
                                        Player queue is not available yet.
                                    </p>
                                ) : null}
                                {[
                                    { label: "User requests", items: queueGroups.user },
                                    { label: "Player / autoplay", items: queueGroups.autoplay },
                                ].map((group) => (
                                    <div key={group.label} className="space-y-2">
                                    <p className="text-xs font-medium text-zinc-400">{group.label}</p>
                                    {group.items.length === 0 && <p className="text-xs text-zinc-500">No upcoming tracks.</p>}
                                    <ul className="queue-tracks space-y-2 overflow-y-auto pr-1">
                                        {group.items.map((item, index) => {
                                            const label = parseQueueLabel(item);
                                            return (
                                                <li
                                                    key={`${index}:${item.id || item.url}`}
                                                    className="flex items-start gap-2 text-xs"
                                                >
                                                    <span className="w-4 shrink-0 pt-0.5 text-zinc-500 tabular-nums">
                                                        {item.current ? "▶" : index + 1}
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
                                    </div>
                                ))}
                                {queueGroups.hiddenAutoplay > 0 && (
                                    <p className="text-xs text-zinc-500">+{queueGroups.hiddenAutoplay} more player tracks</p>
                                )}
                            </CardBody>
                        </Card>

                        <details className="player-settings">
                            <summary>Player settings</summary>
                            <Switch
                                size="sm"
                                isSelected={status.bypassContinueWatching}
                                isDisabled={busy}
                                onValueChange={(enabled) => {
                                    void setBypassContinueWatching(enabled);
                                }}
                            >
                                <span className="text-sm text-zinc-200">Bypass "continue watching"</span>
                            </Switch>
                            <p className="text-xs text-zinc-400">Auto-dismisses YouTube Music's idle dialog and keeps the tab active.</p>
                        </details>

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

                <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-zinc-600">
                    <span>v{currentVersion}</span>
                    <span>Updates are handled by Chrome</span>
                </div>

                <p className="text-center text-[10px] text-zinc-600">
                    Join / leave also available in the YT Music sidebar
                </p>
            </div>
        </div>
    );
}

export default App;
