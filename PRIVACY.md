# Privacy Policy — YouTube Music Party Extension

**Last updated:** July 31, 2026

This privacy policy describes how the **YouTube Music Party** browser extension (“the Extension”, “we”, “us”) handles information when you use it.

The Extension connects [YouTube Music](https://music.youtube.com) to a Telegram Music Party server so a Telegram group can control playback. It is open source: [github.com/faytranevozter/telegram-music-party](https://github.com/faytranevozter/telegram-music-party).

The Extension is not affiliated with YouTube, Google, Chrome, or Telegram.

## Summary

- We do **not** sell your data.
- We do **not** use advertising or third-party analytics SDKs in the Extension.
- Most data stays on your device or is sent only to the **party server URL you choose**.
- We do **not** access your Google/YouTube account password or payment information.

## Who is responsible

This Extension is provided as open-source software by the maintainers of the Telegram Music Party project. If you self-host the backend, that server’s operator (which may be you) is responsible for how server-side data is stored and processed.

## Information the Extension stores on your device

On `music.youtube.com`, the Extension uses the page’s `localStorage` only:

| Key | Purpose |
|-----|---------|
| `roomId` | Room identifier you enter when joining a session |
| `partyUrl` | Party server URL you enter (default prompt may be a local URL for development) |
| `ytmp_device_id` | Random ID generated in the browser so the server can treat this browser as one device per room |
| `ytmp_bypass_continue_watching` | Your preference for auto-dismissing YouTube Music’s “Continue watching?” dialog |

These values are **not** uploaded to Google, GitHub, or any analytics service by the Extension. Leaving a room clears `roomId` (and leave flows may also clear `partyUrl`). You can also clear site data for `music.youtube.com` in your browser to remove them.

The Extension does **not** use `chrome.storage` (or similar) to collect personal profiles.

## Information sent over the network

### 1. Party server (Socket.IO) — required for music party features

When you join a room, the Extension connects to the **party URL you provide** (WebSocket / Socket.IO). It may send or receive:

- Room ID  
- Device ID (`ytmp_device_id`)  
- Browser name and OS string (from a local user-agent parse; used to label the connected device)  
- Playback and queue-related events (e.g. play, pause, next, previous, volume, mute, queue updates, now-playing metadata derived from the YouTube Music page, short status/notify messages)

**You choose the server.** If you use a public or third-party party host, that host’s privacy practices apply to data it receives. If you run your own backend, data stays under your control according to how you configure that deployment.

The Extension does **not** send your Telegram account credentials. Telegram interaction happens via the bot/backend you use with the party server, not by logging into Telegram inside the Extension.

### 2. YouTube Music

The Extension runs content scripts on `https://music.youtube.com/*` to read player UI state and control playback (play, pause, queue, volume, etc.). It interacts with the page in your browser session. It does **not** collect or transmit your Google password. Any requests YouTube Music makes as part of normal site use are governed by [Google’s privacy policy](https://policies.google.com/privacy).

## Permissions and host access

The Extension declares host access to:

- `https://music.youtube.com/*` — inject content scripts and operate the player UI  

It also connects to whatever **party URL you enter** (which may be `http://` or `https://` on a host you control or trust). Use only party servers you trust.

## What we do not collect

The Extension is not designed to collect:

- Name, email, phone number, or postal address  
- Precise location  
- Payment or financial data  
- Browsing history outside YouTube Music party use  
- Content of other websites  
- Advertising identifiers for ad targeting  

We do not sell personal information or share Extension data with data brokers.

## Children

The Extension is not directed at children under 13 (or the equivalent minimum age in your jurisdiction). Do not use it if you are under that age.

## Data retention

- **On device:** Stored until you leave the room, clear site data, or uninstall the Extension.  
- **On a party server:** Retention depends on that server’s operator and configuration (not controlled solely by this Extension).  

## Security

Data in transit to your party server uses the protocol of the URL you supply (prefer **HTTPS** / WSS in production). Random device IDs are generated locally and are not a hardware or cross-site tracking fingerprint beyond this product’s single-device-per-room feature.

No method of transmission or storage is 100% secure. Use trusted networks and servers.

## Your choices

- Do not join a room if you do not want to connect to a party server.  
- Enter only a party URL you trust.  
- Leave the room or clear `music.youtube.com` site data to remove local session keys.  
- Disable or uninstall the Extension at any time in your browser’s extension settings.  
- Turn off the “Continue watching” bypass preference in the popup if you prefer not to use that behavior.

## Third-party services

| Service | Role |
|---------|------|
| YouTube Music (Google) | Music playback site where the Extension runs |
| Party server (user-configured) | Session, queue, and remote control relay |
| Telegram (via bot/backend) | Group commands; not logged into inside the Extension UI |

Each has its own terms and privacy policy.

## Open source and changes

Source code is available in the project repository. This policy may be updated when the Extension’s data practices change. The “Last updated” date at the top will be revised accordingly. Material changes may also be noted in project release notes.

## Contact

Questions about this policy or the Extension’s privacy practices:

- Open an issue: [github.com/faytranevozter/telegram-music-party/issues](https://github.com/faytranevozter/telegram-music-party/issues)  
- Project: [github.com/faytranevozter/telegram-music-party](https://github.com/faytranevozter/telegram-music-party)

If you operate a deployed party backend, also document how that deployment stores logs, rooms, and device records for your users.
