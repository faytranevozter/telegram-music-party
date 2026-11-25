import { Socket } from "socket.io-client";
import { detect } from "detect-browser";
import { Config, DEFAULT_PARTY_URL, saveRoomConfig } from "../constants/config";

const DEVICE_ID_KEY = "ytmp_device_id";

export function getDeviceId(): string {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;

    const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
}

export function getDeviceInfo(config: Config) {
    const info = detect();
    const fingerprint = getDeviceId();
    const browser = [
        (info?.name?.slice(0, 1).toUpperCase() || "") +
            (info?.name?.slice(1) || ""),
        info?.os,
    ];

    return {
        id: config.roomId || "",
        browser: browser.filter(Boolean).join(" ") || "",
        fingerprint,
    };
}

const CONTROL_ID = "ytmp-party-control";
const PLAYER_BAR_SELECTOR = "ytmusic-player-bar";
const CONTROL_EDGE_PX = 16;
// Entries injected by earlier builds into the YouTube Music guide. They stay
// in a tab when the extension is reloaded or a second copy is installed, and
// the new control no longer lives there, so they would read as leftovers.
const LEGACY_SIDEBAR_LABELS = new Set(["Leave Room", "Join Room"]);

const BRAND = {
    surface: "var(--ytmp-overlay-surface)",
    surfaceHover: "var(--ytmp-hover)",
    border: "var(--ytmp-border)",
    borderHover: "var(--ytmp-field-border)",
    text: "var(--ytmp-text)",
    accent: "var(--ytmp-accent)",
};

const CONTROL_STYLE_ID = "ytmp-party-control-style";

const JOIN_DIALOG_ID = "ytmp-join-dialog";
const JOIN_PANEL_CLASS = "ytmp-join-panel";
const JOIN_ROOM_INPUT_ID = "ytmp-join-room";
const JOIN_SERVER_INPUT_ID = "ytmp-join-server";
const JOIN_ERROR_ID = "ytmp-join-error";
const JOIN_SUBMIT_ID = "ytmp-join-submit";
const JOIN_CANCEL_ID = "ytmp-join-cancel";

function hostTheme() {
    for (const root of [document.documentElement, document.querySelector("ytmusic-app")]) {
        if (!root) continue;
        const explicit = root.getAttribute("data-theme") ?? root.getAttribute("theme");
        if (explicit === "light" || explicit === "dark") return explicit;
        if (root.hasAttribute("dark")) return "dark";
        if (root.hasAttribute("light")) return "light";
    }
    return "dark";
}

let hostThemeObserver: MutationObserver | undefined;

function syncHostTheme() {
    const theme = hostTheme();
    for (const id of [CONTROL_ID, JOIN_DIALOG_ID]) {
        const element = document.getElementById(id);
        if (element) element.dataset.ytmpTheme = theme;
    }
}

function followHostTheme() {
    syncHostTheme();
    hostThemeObserver ??= new MutationObserver(syncHostTheme);
    hostThemeObserver.disconnect();
    for (const root of [document.documentElement, document.querySelector("ytmusic-app")]) {
        if (root) hostThemeObserver.observe(root, { attributeFilter: ["data-theme", "theme", "dark", "light"] });
    }
}

const CONTROL_STYLES: Partial<CSSStyleDeclaration> = {
    position: "fixed",
    left: "16px",
    bottom: "16px",
    zIndex: "1200",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 16px",
    borderRadius: "999px",
    border: `1px solid ${BRAND.border}`,
    background: BRAND.surface,
    backdropFilter: "blur(12px)",
    color: BRAND.text,
    fontFamily: "Roboto, Arial, sans-serif",
    fontSize: "14px",
    fontWeight: "600",
    letterSpacing: "0.1px",
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(3, 3, 3, 0.5)",
};

function ensureControlStyles() {
    if (document.getElementById(CONTROL_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = CONTROL_STYLE_ID;
    style.textContent = `
#${CONTROL_ID}, #${JOIN_DIALOG_ID} {
    color-scheme: dark;
    --ytmp-overlay-surface: rgba(21, 25, 34, 0.92);
    --ytmp-panel: #151922;
    --ytmp-hover: #232d43;
    --ytmp-field: #202734;
    --ytmp-border: #394253;
    --ytmp-field-border: #66748f;
    --ytmp-text: #f5f7fc;
    --ytmp-hint: #bdcae3;
    --ytmp-error: #ffb4ab;
    --ytmp-accent: #adc2ff;
    --ytmp-accent-hover: #c3d2ff;
    --ytmp-accent-content: #182544;
}
#${CONTROL_ID}[data-ytmp-theme="light"], #${JOIN_DIALOG_ID}[data-ytmp-theme="light"] {
    color-scheme: light;
    --ytmp-overlay-surface: rgba(247, 249, 252, 0.96);
    --ytmp-panel: #f7f9fc;
    --ytmp-hover: #e5ecfa;
    --ytmp-field: #fff;
    --ytmp-border: #cad3e2;
    --ytmp-field-border: #74829b;
    --ytmp-text: #20242c;
    --ytmp-hint: #526079;
    --ytmp-error: #9d251e;
    --ytmp-accent: #2845a8;
    --ytmp-accent-hover: #20388a;
    --ytmp-accent-content: #fff;
}
#${CONTROL_ID} { transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease; }
#${CONTROL_ID}:hover { background: ${BRAND.surfaceHover}; border-color: ${BRAND.borderHover}; }
#${CONTROL_ID}:active { transform: translateY(1px); }
#${CONTROL_ID}:focus-visible { outline: 2px solid ${BRAND.accent}; outline-offset: 3px; }

#${JOIN_DIALOG_ID} {
    position: fixed;
    inset: 0;
    z-index: 1300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(3, 3, 3, 0.72);
    backdrop-filter: blur(4px);
    font-family: Roboto, Arial, sans-serif;
}
.${JOIN_PANEL_CLASS} {
    width: min(420px, 100%);
    box-sizing: border-box;
    padding: 24px;
    border-radius: 16px;
    border: 1px solid ${BRAND.border};
    background: var(--ytmp-panel);
    color: ${BRAND.text};
    box-shadow: 0 24px 60px rgba(3, 3, 3, 0.6);
}
.${JOIN_PANEL_CLASS} h2 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
.${JOIN_PANEL_CLASS} .ytmp-join-hint { margin: 6px 0 0; font-size: 12px; color: var(--ytmp-hint); }
.ytmp-join-field { display: grid; gap: 8px; margin-top: 16px; }
.ytmp-join-field span { font-size: 12px; font-weight: 600; color: var(--ytmp-hint); }
.ytmp-join-field input {
    width: 100%;
    box-sizing: border-box;
    height: 44px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid ${BRAND.borderHover};
    background: var(--ytmp-field);
    color: ${BRAND.text};
    font: inherit;
    font-size: 14px;
}
.ytmp-join-field input:focus { outline: 2px solid ${BRAND.accent}; outline-offset: 2px; }
.ytmp-join-error { min-height: 18px; margin: 12px 0 0; font-size: 12px; color: var(--ytmp-error); }
.ytmp-join-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.ytmp-join-actions button {
    min-height: 40px;
    padding: 0 18px;
    border-radius: 999px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
}
#${JOIN_CANCEL_ID} { background: transparent; border: 1px solid ${BRAND.borderHover}; color: ${BRAND.text}; }
#${JOIN_CANCEL_ID}:hover { border-color: ${BRAND.accent}; }
#${JOIN_SUBMIT_ID} { background: ${BRAND.accent}; border: 1px solid transparent; color: var(--ytmp-accent-content); }
#${JOIN_SUBMIT_ID}:hover { background: var(--ytmp-accent-hover); }
#${JOIN_SUBMIT_ID}:focus-visible, #${JOIN_CANCEL_ID}:focus-visible { outline: 2px solid ${BRAND.accent}; outline-offset: 3px; }
`;
    document.head.append(style);
}

function createControlIcon(join: boolean) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("fill", "none");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke", "currentColor");
    svg.style.width = "20px";
    svg.style.height = "20px";
    svg.style.flexShrink = "0";
    svg.style.color = BRAND.accent;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute(
        "d",
        join
            ? "M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m15-3.379a48.474 48.474 0 0 0-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 0 1 3 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 0 1 6 13.12M12.265 3.11a.375.375 0 1 1-.53 0L12 2.845l.265.265Zm-3 0a.375.375 0 1 1-.53 0L9 2.845l.265.265Zm6 0a.375.375 0 1 1-.53 0L15 2.845l.265.265Z"
            : "M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75",
    );

    svg.appendChild(path);
    return svg;
}

function removeLegacySidebarButtons() {
    document.querySelectorAll("tp-yt-paper-item").forEach((item) => {
        const label = item.textContent?.trim() ?? "";
        if (LEGACY_SIDEBAR_LABELS.has(label)) item.remove();
    });
}

let legacyObserver: MutationObserver | null = null;
let legacyCleanupTimers: Array<ReturnType<typeof setTimeout>> = [];

// A copy of an older build injects its guide entry a couple of seconds after
// the page loads (its own document_start timer). Sweep a few times so it is
// cleared whether it lands before or after this control mounts.
const LEGACY_CLEANUP_DELAYS = [1000, 3000, 6000];

function watchLegacySidebarButtons() {
    if (legacyObserver || typeof MutationObserver === "undefined") return;

    legacyObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (
                    node instanceof HTMLElement &&
                    (node.matches("tp-yt-paper-item") ||
                        node.querySelector("tp-yt-paper-item"))
                ) {
                    removeLegacySidebarButtons();
                    return;
                }
            }
        }
    });
    legacyObserver.observe(document.body, { childList: true, subtree: true });

    legacyCleanupTimers.forEach((timer) => clearTimeout(timer));
    legacyCleanupTimers = LEGACY_CLEANUP_DELAYS.map((delay) =>
        setTimeout(removeLegacySidebarButtons, delay),
    );
}

/**
 * Sit just above the player bar when YouTube Music shows one, and at the
 * viewport edge when it doesn't (freshly opened or signed-out home). The bar
 * appears and disappears without a reload, so this is re-checked.
 */
export function syncControlPosition(control: HTMLElement) {
    const bar = document.querySelector<HTMLElement>(PLAYER_BAR_SELECTOR);
    const playerBarHeight = bar?.getBoundingClientRect().height ?? 0;
    control.style.bottom = `${playerBarHeight + CONTROL_EDGE_PX}px`;
}

let positionTimer: ReturnType<typeof setInterval> | null = null;

function trackPlayerBarPosition(control: HTMLElement) {
    if (positionTimer) clearInterval(positionTimer);
    syncControlPosition(control);
    positionTimer = setInterval(() => {
        if (!control.isConnected) {
            if (positionTimer) clearInterval(positionTimer);
            positionTimer = null;
            return;
        }
        syncControlPosition(control);
    }, 500);
}

/**
 * Render the single join/leave control this extension owns. It sits on the
 * viewport instead of YouTube Music's guide, which is re-rendered on
 * navigation, and it is keyed by id so a content script that runs twice (an
 * extension reload or a second installed copy) replaces it instead of adding
 * another entry.
 */
export function mountPartyControl({
    action,
    label,
    onClick,
}: {
    action: "join" | "leave";
    label: string;
    onClick: () => void;
}) {
    document.getElementById(CONTROL_ID)?.remove();
    removeLegacySidebarButtons();
    watchLegacySidebarButtons();
    ensureControlStyles();

    const control = document.createElement("button");
    control.id = CONTROL_ID;
    control.type = "button";
    control.dataset.ytmpAction = action;
    control.setAttribute("aria-label", label);
    Object.assign(control.style, CONTROL_STYLES);

    const text = document.createElement("span");
    text.textContent = label;
    control.append(createControlIcon(action === "join"), text);
    control.addEventListener("click", onClick);

    document.body.append(control);
    followHostTheme();
    trackPlayerBarPosition(control);
    return control;
}

function createJoinField({
    id,
    label,
    value,
}: {
    id: string;
    label: string;
    value: string;
}) {
    const field = document.createElement("label");
    field.className = "ytmp-join-field";
    field.htmlFor = id;

    const text = document.createElement("span");
    text.textContent = label;

    const input = document.createElement("input");
    input.id = id;
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = value;

    field.append(text, input);
    return { field, input };
}

function onJoinDialogKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") closeJoinDialog();
}

export function closeJoinDialog() {
    document.getElementById(JOIN_DIALOG_ID)?.remove();
    document.removeEventListener("keydown", onJoinDialogKeydown);
}

/**
 * In-page replacement for the native prompts: same validation, but the two
 * fields, the error and the buttons can be styled like the rest of the party UI.
 */
export function openJoinDialog() {
    closeJoinDialog();
    ensureControlStyles();

    const overlay = document.createElement("div");
    overlay.id = JOIN_DIALOG_ID;

    const panel = document.createElement("form");
    panel.className = JOIN_PANEL_CLASS;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "ytmp-join-title");

    const title = document.createElement("h2");
    title.id = "ytmp-join-title";
    title.textContent = "Join a room";

    const hint = document.createElement("p");
    hint.className = "ytmp-join-hint";
    hint.textContent = "Paste the room ID from Telegram /register.";

    const room = createJoinField({
        id: JOIN_ROOM_INPUT_ID,
        label: "Room ID",
        value: "",
    });
    const server = createJoinField({
        id: JOIN_SERVER_INPUT_ID,
        label: "Party server",
        value: DEFAULT_PARTY_URL,
    });

    const error = document.createElement("p");
    error.id = JOIN_ERROR_ID;
    error.className = "ytmp-join-error";
    error.setAttribute("role", "alert");

    const actions = document.createElement("div");
    actions.className = "ytmp-join-actions";

    const cancel = document.createElement("button");
    cancel.id = JOIN_CANCEL_ID;
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", closeJoinDialog);

    const submit = document.createElement("button");
    submit.id = JOIN_SUBMIT_ID;
    submit.type = "submit";
    submit.textContent = "Join";

    actions.append(cancel, submit);
    panel.append(title, hint, room.field, server.field, error, actions);
    overlay.append(panel);

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeJoinDialog();
    });

    panel.addEventListener("submit", (event) => {
        event.preventDefault();
        try {
            saveRoomConfig(room.input.value, server.input.value);
        } catch (err) {
            error.textContent =
                err instanceof Error
                    ? err.message
                    : "Could not save room configuration.";
            return;
        }
        closeJoinDialog();
        window.location.reload();
    });

    document.body.append(overlay);
    followHostTheme();
    document.addEventListener("keydown", onJoinDialogKeydown);
    room.input.focus();
    return overlay;
}

export function createLeaveButton(socket: Socket, config: Config) {
    setTimeout(() => {
        mountPartyControl({
            action: "leave",
            label: "Leave Room",
            onClick: () => {
                console.log("Leaving room...");

                socket.emit("leave", {
                    roomId: config.roomId,
                    fingerprint: config.fingerprint,
                });

                localStorage.removeItem("roomId");
                localStorage.removeItem("partyUrl");

                // refresh the page
                window.location.reload();
            },
        });
    }, 2000);
}

export function createJoinButton() {
    setTimeout(() => {
        mountPartyControl({
            action: "join",
            label: "Join Room",
            onClick: () => {
                openJoinDialog();
            },
        });
    }, 2000);
}
