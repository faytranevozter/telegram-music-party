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

window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as
        | BridgeResponseMessage
        | StatusPushMessage
        | undefined;
    if (!data || data.source !== YTMP_MAIN) return;

    if (data.type === "STATUS_PUSH") {
        const push: PopupStatusMessage = {
            type: "STATUS_PUSH",
            status: data.status,
        };
        void chrome.runtime.sendMessage(push).catch(() => {
            // popup may be closed
        });
        return;
    }

    if (!("id" in data) || !data.id) return;

    const entry = pending.get(data.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(data.id);
    entry.resolve(data);
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
    if (
        !request ||
        (request.type !== "GET_STATUS" &&
            request.type !== "CONTROL" &&
            request.type !== "LEAVE")
    ) {
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
