import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { BridgeRequest, PopupStatusMessage, SessionStatus } from "./shared/messages";

// Keep component tests focused on popup lifecycle rather than HeroUI animation internals.
vi.mock("@heroui/react", () => {
    const Box = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
    return {
        Card: Box, CardBody: Box, Chip: Box, Divider: Box, Spinner: Box, Switch: Box,
        Button: ({ children, onPress, isDisabled, type }: { children: ReactNode; onPress?: () => void; isDisabled?: boolean; type?: "submit" | "button" }) =>
            createElement("button", { onClick: onPress, disabled: isDisabled, type: type ?? "button" }, children),
        Input: ({ label, value, onValueChange, isDisabled }: { label: string; value: string; onValueChange: (value: string) => void; isDisabled?: boolean }) =>
            createElement("label", null, label, createElement("input", { "aria-label": label, value, disabled: isDisabled, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value) })),
    };
});

const baseStatus: SessionStatus = {
    connected: false, socketConnected: false, hasRoom: false, joinRejected: false,
    roomId: null, partyUrl: null, playback: null, queue: [], userQueue: [], queueAvailable: false, bypassContinueWatching: true,
};

describe("popup room joining", () => {
    let root: Root;
    let container: HTMLDivElement;
    let pageStatus: SessionStatus;
    const sendMessage = vi.fn();
    const query = vi.fn();
    const createTab = vi.fn();
    let listeners: Set<(message: PopupStatusMessage, sender: chrome.runtime.MessageSender) => void>;

    async function mount() {
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        await act(async () => { root.render(createElement(App)); });
    }
    const text = () => container.textContent ?? "";
    const button = (label: string) => Array.from(container.querySelectorAll("button")).find((el) => el.textContent === label)!;
    async function click(label: string) {
        await act(async () => { button(label).click(); });
    }
    async function edit(label: string, value: string) {
        const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    }
    async function push(status: SessionStatus, id = 42) {
        pageStatus = status;
        await act(async () => {
            for (const listener of listeners) listener({ type: "STATUS_PUSH", status }, { tab: { id } as chrome.tabs.Tab });
        });
    }
    async function advance(ms: number) {
        await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        pageStatus = { ...baseStatus };
        listeners = new Set();
        query.mockResolvedValue([{ id: 42, active: true }, { id: 99 }]);
        sendMessage.mockImplementation(async (_id: number, request: BridgeRequest) => {
            if (request.type === "GET_STATUS") return { type: "STATUS", status: pageStatus };
            return { type: "OK" };
        });
        vi.stubGlobal("chrome", {
            tabs: { query, sendMessage, create: createTab },
            runtime: {
                getManifest: () => ({ version: "1.10.0" }),
                onMessage: { addListener: (listener: never) => listeners.add(listener), removeListener: (listener: never) => listeners.delete(listener) },
            },
        });
    });
    afterEach(async () => {
        await act(async () => { root?.unmount(); });
        container?.remove();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("joins fresh from the popup, keeps acknowledgement separate from admission, and filters tabs", async () => {
        await mount();
        expect(button("Join Room").disabled).toBe(true);
        await edit("Room ID", " room-123 ");
        await click("Join Room");
        expect(sendMessage).toHaveBeenCalledWith(42, { type: "JOIN_ROOM", roomId: "room-123", partyUrl: "https://music.ytparty.my.id" });
        expect(text()).toContain("Waiting for room admission");
        expect(text()).not.toContain("Connected");
        expect(button("Connecting…").disabled).toBe(true);
        const admitted = { ...baseStatus, hasRoom: true, roomId: "room-123", connected: true, socketConnected: true };
        await push(admitted, 99);
        expect(text()).not.toContain("Connected");
        await push(admitted);
        expect(text()).toContain("Connected");
        expect(text()).toContain("Leave room");
        expect(container.querySelector("form")).toBeNull();
    });

    it("keeps edits on status pushes, rejects invalid URL and preserves custom paths", async () => {
        await mount();
        await edit("Room ID", "new-room");
        await edit("Party server URL", "ftp://bad.example");
        await push({ ...baseStatus, partyUrl: "https://saved.example" });
        await click("Join Room");
        expect(text()).toContain("valid HTTP(S)");
        expect(sendMessage.mock.calls.filter(([, request]) => request.type === "JOIN_ROOM")).toHaveLength(0);
        await edit("Party server URL", " http://localhost:3010/custom ");
        await click("Join Room");
        expect(sendMessage).toHaveBeenCalledWith(42, { type: "JOIN_ROOM", roomId: "new-room", partyUrl: "http://localhost:3010/custom" });
    });

    it("prefills the saved server without replacing an edited room ID", async () => {
        await mount();
        await edit("Room ID", "my-edit");
        await push({ ...baseStatus, roomId: "saved-room", partyUrl: "https://saved.example/custom" });
        expect(container.querySelector<HTMLInputElement>('input[aria-label="Room ID"]')!.value).toBe("my-edit");
        expect(container.querySelector<HTMLInputElement>('input[aria-label="Party server URL"]')!.value).toBe("https://saved.example/custom");
    });

    it("bounds admission waiting, preserves entries and allows payload-free retry", async () => {
        pageStatus = { ...baseStatus, hasRoom: true, socketConnected: true, roomId: "unknown", partyUrl: "https://saved.example" };
        await mount();
        await advance(30000);
        expect(text()).toContain("Room admission was not confirmed");
        expect(text()).not.toContain("does not exist");
        await click("Retry join");
        expect(sendMessage).toHaveBeenCalledWith(42, { type: "JOIN" });
        expect(text()).toContain("Connecting…");
        await push({ ...pageStatus, joinRejected: true });
        expect(text()).toContain("Room is busy");
        expect(button("Retry join").disabled).toBe(false);
    });

    it("recovers readiness after reload and reflects admission on reopening", async () => {
        await mount();
        await edit("Room ID", "saved-room");
        await click("Join Room");
        sendMessage.mockRejectedValueOnce(new Error("Tab reloading"));
        pageStatus = { ...baseStatus, hasRoom: true, roomId: "saved-room", connected: true, socketConnected: true };
        await advance(1500);
        expect(text()).toContain("Connected");
        await act(async () => { root.unmount(); });
        container.remove();
        await mount();
        expect(text()).toContain("Connected");
        expect(text()).toContain("saved-room");
    });

    it("handles bridge-not-ready without losing input and stops readiness retries", async () => {
        sendMessage.mockRejectedValue(new Error("No bridge"));
        await mount();
        await edit("Room ID", "keep-me");
        await advance(6000);
        expect(text()).toContain("bridge is unavailable");
        expect(sendMessage).toHaveBeenCalledTimes(8);
        expect(container.querySelector<HTMLInputElement>('input[aria-label="Room ID"]')!.value).toBe("keep-me");
        sendMessage.mockResolvedValue({ type: "STATUS", status: baseStatus });
        await click("Retry connection");
        expect(text()).not.toContain("bridge is unavailable");
    });

    it("offers no-tab recovery and explains reopening", async () => {
        query.mockResolvedValue([]);
        await mount();
        expect(text()).toContain("reopen this popup to join");
        expect(button("Open YouTube Music")).toBeDefined();
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it("keeps an unreachable server editable and retryable", async () => {
        pageStatus = { ...baseStatus, hasRoom: true, roomId: "saved", partyUrl: "http://localhost:3010" };
        await mount();
        expect(text()).toContain("Server unreachable");
        sendMessage.mockResolvedValueOnce({ type: "ERROR", message: "Server unreachable" });
        await click("Retry join");
        expect(button("Join Room").disabled).toBe(false);
        expect(container.querySelector<HTMLInputElement>('input[aria-label="Room ID"]')!.value).toBe("saved");
        await edit("Party server URL", "http://localhost:3000");
        await click("Join Room");
        expect(sendMessage).toHaveBeenCalledWith(42, { type: "JOIN_ROOM", roomId: "saved", partyUrl: "http://localhost:3000" });
    });

    it("allows leaving and joining another room", async () => {
        pageStatus = { ...baseStatus, hasRoom: true, roomId: "old", connected: true, socketConnected: true };
        await mount();
        await click("Leave room");
        pageStatus = { ...baseStatus };
        await advance(750);
        await edit("Room ID", "another-room");
        await click("Join Room");
        expect(sendMessage).toHaveBeenCalledWith(42, expect.objectContaining({ type: "JOIN_ROOM", roomId: "another-room" }));
    });
});
