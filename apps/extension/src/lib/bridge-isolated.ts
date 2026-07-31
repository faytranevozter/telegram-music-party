import {
    BridgeRequest,
    BridgeRequestMessage,
    BridgeResponse,
    BridgeResponseMessage,
    PopupStatusMessage,
    StatusPushMessage,
    YTMP_BRIDGE,
    YTMP_MAIN,
} from "../shared/messages";

const pending = new Map<
    string,
    {
        resolve: (value: BridgeResponseMessage) => void;
        reject: (reason?: unknown) => void;
        timer: ReturnType<typeof setTimeout>;
    }
>();

const BRIDGE_REQUEST_TYPES = new Set([
    "GET_STATUS",
    "CONTROL",
    "LEAVE",
    "JOIN",
    "SET_CONTINUE_WATCHING_BYPASS",
]);

window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    const raw = event.data as
        | BridgeResponseMessage
        | StatusPushMessage
        | undefined;
    if (!raw || typeof raw !== "object" || !("source" in raw)) return;

    if (raw.source !== YTMP_MAIN) return;

    if ("type" in raw && raw.type === "STATUS_PUSH" && "status" in raw) {
        const push: PopupStatusMessage = {
            type: "STATUS_PUSH",
            status: raw.status,
        };
        void chrome.runtime.sendMessage(push).catch(() => {
            // popup may be closed
        });
        return;
    }

    if (!("id" in raw) || !raw.id || !("type" in raw)) return;
    if (
        raw.type !== "STATUS" &&
        raw.type !== "OK" &&
        raw.type !== "ERROR"
    ) {
        return;
    }

    const response = raw as BridgeResponseMessage;
    const entry = pending.get(response.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(response.id);
    entry.resolve(response);
});

function sendToMain(request: BridgeRequest, timeoutMs = 3000) {
    return new Promise<BridgeResponseMessage>((resolve, reject) => {
        const id = crypto.randomUUID();
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error("Timed out waiting for page bridge"));
        }, timeoutMs);

        pending.set(id, { resolve, reject, timer });

        const message: BridgeRequestMessage = {
            source: YTMP_BRIDGE,
            id,
            ...request,
        };
        window.postMessage(message, "*");
    });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const request = message as BridgeRequest;
    if (!request || !BRIDGE_REQUEST_TYPES.has(request.type)) {
        return false;
    }

    sendToMain(request)
        .then((response) => {
            sendResponse({
                type: response.type,
                ...("status" in response ? { status: response.status } : {}),
                ...("message" in response
                    ? { message: response.message }
                    : {}),
            } as BridgeResponse);
        })
        .catch((error: unknown) => {
            sendResponse({
                type: "ERROR",
                message:
                    error instanceof Error
                        ? error.message
                        : "Bridge request failed",
            });
        });

    return true;
});
