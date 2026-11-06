import type { BridgeRequest, BridgeResponse, SessionStatus } from "../shared/messages";

export function sendToTab(tabId: number, message: BridgeRequest): Promise<BridgeResponse> {
    return chrome.tabs.sendMessage(tabId, message) as Promise<BridgeResponse>;
}

export async function waitForTabStatus(
    tabId: number,
    signal: AbortSignal,
): Promise<SessionStatus | null> {
    // Readiness recovery only: steady-state updates still come from STATUS_PUSH.
    for (let attempt = 0; attempt < 8 && !signal.aborted; attempt++) {
        try {
            const response = await sendToTab(tabId, { type: "GET_STATUS" });
            if (signal.aborted) return null;
            if (response?.type === "STATUS") return response.status;
        } catch {
            // Content scripts disappear briefly while YouTube Music reloads.
        }
        if (attempt < 7 && !signal.aborted) {
            await new Promise<void>((resolve) => {
                const finish = () => {
                    clearTimeout(timer);
                    signal.removeEventListener("abort", finish);
                    resolve();
                };
                const timer = setTimeout(finish, 750);
                signal.addEventListener("abort", finish, { once: true });
            });
        }
    }
    if (signal.aborted) return null;
    throw new Error("YouTube Music's extension bridge is unavailable. Reload that tab, then retry connection.");
}
