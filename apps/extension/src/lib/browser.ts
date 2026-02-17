/* eslint-disable @typescript-eslint/no-explicit-any */
import { Socket } from "socket.io-client";
import { Config, DEFAULT_PARTY_URL } from "../constants/config";

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

function createButton({
    onClick,
    children,
    join = true,
}: {
    onClick: any;
    children: string;
    join?: boolean;
}) {
    // const wrapBtn = document.createElement("ytmusic-guide-entry-renderer");
    const btn = document.createElement("tp-yt-paper-item");
    btn.setAttribute("role", "link");
    btn.classList.add("style-scope", "ytmusic-guide-entry-renderer");
    btn.setAttribute("style-target", "host");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-disabled", "false");
    btn.setAttribute("aria-current", "false");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("fill", "none");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke", "currentColor");
    svg.style.width = "24px";
    svg.style.height = "24px";

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

    const txt = document.createElement("span");
    txt.style.margin = "0 20px";

    txt.textContent = children;
    btn.appendChild(svg);
    btn.appendChild(txt);

    btn.addEventListener("click", onClick);

    return btn;

    // wrapBtn.appendChild(btn);
    // return wrapBtn;
}

export function createLeaveButton(socket: Socket, config: Config) {
    setTimeout(async () => {
        const btn = createButton({
            children: "Leave Room",
            onClick: async () => {
                console.log("Leaving room...");

                socket.emit("leave", {
                    id: config.roomId,
                    fingerprint: config.fingerprint,
                });

                // remove from local storage
                Object.keys(config).forEach((key) => {
                    localStorage.removeItem(key);
                });

                // refresh the page
                window.location.reload();
            },
            join: false,
        });
        document
            .querySelector(
                "[class='scroller scroller-on-hover style-scope ytmusic-guide-section-renderer']",
            )
            ?.append(btn);
    }, 2000);
}

export function createJoinButton() {
    setTimeout(async () => {
        const btn = createButton({
            children: "Join Room",
            onClick: async () => {
                // popup the room ID
                const roomId = prompt("Enter your room ID");
                if (!roomId) return;

                const partyUrl = prompt(
                    "Enter your party URL",
                    DEFAULT_PARTY_URL,
                );
                if (!partyUrl) return;

                // save roomId and partyUrl into local storage
                localStorage.setItem("roomId", roomId);
                localStorage.setItem("partyUrl", partyUrl);

                // reload after saving onto local storage
                if (roomId && partyUrl) {
                    window.location.reload();
                }
            },
            join: true,
        });
        document
            .querySelector(
                "[class='scroller scroller-on-hover style-scope ytmusic-guide-section-renderer']",
            )
            ?.append(btn);
    }, 2000);
}
