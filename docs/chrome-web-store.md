# Chrome Web Store Publishing

Use this checklist when publishing the YouTube Music Party browser extension to the Chrome Web Store.

## Auto-Update

Chrome Web Store hosted extensions update automatically. Do not add a custom `update_url` for the Web Store build.

- Bump `version` in `apps/extension/public/manifest.json` for every upload.
- Build and upload a new ZIP through the Chrome Web Store Developer Dashboard.
- Chrome will install the update automatically when the published version is higher.
- `update_url` is only for self-hosted/off-store extension distribution.

The Web Store build should not include a manual ZIP downloader or release checker. Keep a simple current-version display and let Chrome manage extension updates.

## Store Listing Fields

### Description

```text
YouTube Music Party connects one browser tab to a room controlled from a Telegram group, so participants can manage a shared listening session.

Use it to join a room from music.youtube.com, connect to your backend, and let group members add tracks, use playback controls, vote, and manage the queue.

Features:
- Join or leave a room from the music page
- Connect to a configurable party backend
- Control play, pause, next, previous, mute, and volume
- View current room, connection status, now playing, and queue from the popup
- Keep YouTube Music active during long shared sessions
- Works with the companion bot/backend in this project

How it works:
1. Open music.youtube.com
2. Click Join on the YouTube Music page
3. Enter your room ID and party server URL
4. Use the Telegram bot in your group to control playback

This extension only runs on music.youtube.com. It does not collect account credentials, passwords, or personal browsing history.

Not affiliated with YouTube, Google, Chrome, or Telegram.
```

### Summary

```text
Connect a music tab to a group-controlled listening room.
```

Alternative if a longer summary is preferred:

```text
Join a room, view status, and control a shared listening queue from the extension popup.
```

### Category

Recommended:

```text
Fun
```

Alternative:

```text
Productivity
```

### Language

```text
English
```

### Official URL

Use a verified domain if available. Otherwise select:

```text
None
```

### Homepage URL

Use the project repository unless there is a dedicated landing page:

```text
https://github.com/faytranevozter/telegram-music-party
```

### Support URL

```text
https://github.com/faytranevozter/telegram-music-party/issues
```

### Mature Content

```text
Off
```

### Global Promo Video

Leave empty unless there is a polished demo video.

## Graphic Assets

### Store Icon

- Required size: `128x128`.
- Use PNG.
- Make sure it is readable at small sizes.
- Avoid a mostly transparent icon.

### Screenshots

Upload 3-5 screenshots. At least one is required.

Accepted sizes:

- `1280x800`
- `640x400`

Recommended screenshots:

- Popup connected state.
- YouTube Music page with the Join/Leave entry point.
- Telegram bot commands controlling playback or queue.
- Popup showing now playing and queue.
- Room configuration/settings if visually useful.

### Small Promo Tile

Optional but recommended.

- Size: `440x280`.
- Text idea: `YouTube Music Party` and `Control shared music from Telegram`.

### Marquee Promo Tile

Optional. Skip unless polished artwork is available.

## Privacy Page Fields

These values match the current manifest and source code. If permissions or data handling change, update these answers before submitting.

### Single Purpose Description

```text
YouTube Music Party lets a user connect a YouTube Music tab to a Telegram-controlled party room so group members can manage shared playback and queue actions.
```

### activeTab Justification

The current manifest does not request `activeTab`. If it is added later, use:

```text
The extension uses activeTab only to interact with the user's active YouTube Music tab when the user opens the popup and chooses playback or session actions.
```

### scripting Justification

The current manifest does not request `scripting`. Scripts are declared in `content_scripts`. If `scripting` is added later, use:

```text
The extension uses scripting only to support extension-controlled interaction with the YouTube Music page required for joining a room and controlling playback.
```

### tabs Justification

```text
The extension uses tabs permission to find an open music.youtube.com tab, send popup commands to the content script in that tab, and open YouTube Music when the user clicks a button.
```

### storage Justification

The current manifest does not request `storage`. The current code stores room settings in the YouTube Music page's localStorage instead of `chrome.storage`. If `storage` is added later, use:

```text
The extension uses storage to remember user session settings such as room connection preferences and playback helper options between browser sessions.
```

### Host Permission Justification

Use this for the current manifest:

```text
The extension needs access to music.youtube.com to add the party room controls, read the current playback state, update the queue, and execute playback commands requested by the user or their connected Telegram party room.
```

### Remote Code

Recommended answer:

```text
No, I am not using remote code
```

Reason: Socket.IO messages, backend API responses, and fetched JSON are data, not remote executable code, as long as the extension does not execute remote JavaScript, WebAssembly, dynamic script text, or strings via `eval`.

If the dashboard currently selected `Yes`, switch it to `No`. Do not add a remote-code justification unless the extension actually executes code loaded from a server.

### Data Usage Checkboxes

For the current code, recommended boxes to select:

- Personally identifiable information
- User activity
- Website content

Why:

- The extension stores/sends a generated device identifier/fingerprint for active-device handling.
- The extension reads current playback state and queue metadata from YouTube Music.
- The extension responds to user playback actions and room activity.

Do not under-disclose; rejection risk is higher than selecting a broader accurate category.

Recommended boxes to leave unchecked unless your hosted backend collects them elsewhere:

- Health information
- Financial and payment information
- Authentication information
- Personal communications
- Location
- Web history

### Data Use Certifications

Check all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Only check these if they are true for the extension and backend deployment.

### Privacy Policy URL

Use a public privacy policy URL. Recommended if you add one to the repository:

```text
https://github.com/faytranevozter/telegram-music-party/blob/main/PRIVACY.md
```

Raw URL alternative:

```text
https://raw.githubusercontent.com/faytranevozter/telegram-music-party/main/PRIVACY.md
```

Better if you have a website:

```text
https://your-domain.com/privacy
```

The privacy policy should mention:

- What data is processed: room ID, backend URL, generated device ID/fingerprint, browser/OS label, playback state, queue metadata, and user-selected settings.
- Why it is processed: connecting the YouTube Music tab to a party room and enabling shared playback controls.
- Where it is sent: the configured party backend and the IP lookup service if still used.
- Data selling: not sold.
- Retention: depends on the configured backend; local settings stay in browser storage until the user leaves/clears them.
- Contact/support URL.

## Build And Upload

From the repository root:

```bash
pnpm --filter=extension build
```

Zip the contents of `apps/extension/dist`, not the `dist` directory itself:

```bash
cd apps/extension/dist
zip -r ../extension-webstore.zip .
```

Upload `apps/extension/extension-webstore.zip` in the Chrome Web Store Developer Dashboard.

## Release Checklist

Before submitting for review:

- Increment `version` in `apps/extension/public/manifest.json`.
- Run `pnpm --filter=extension lint`.
- Run `pnpm --filter=extension test`.
- Run `pnpm --filter=extension build`.
- Load `apps/extension/dist` as an unpacked extension locally.
- Test joining a room on `music.youtube.com`.
- Test popup status, queue, playback controls, and leave.
- Test Telegram commands reaching the extension through the backend.
- Upload the ZIP to Chrome Web Store.
- Publish to trusted testers first for risky changes.

## Permission Recommendations

Keep permissions as narrow as possible before submitting.

Recommended host permission for the Web Store build:

```json
"host_permissions": ["https://music.youtube.com/*"]
```

Do not add `activeTab`, `scripting`, `storage`, or extra host permissions unless the code needs them. Fewer permissions usually means easier review and better user trust.

## Privacy Notes

Disclose extension behavior accurately in the privacy form.

Recommended disclosure points:

- The extension runs on `music.youtube.com`.
- It connects to the party backend URL configured by the user.
- It may send room ID, connection state, playback metadata, queue metadata, and device identifier needed for the party session.
- It does not collect YouTube credentials, passwords, or personal browsing history.

## Rejection: Spam And Placement In The Store

If the draft is rejected with `Spam and Placement in the Store`, review these items before resubmitting:

- Remove keyword stuffing from the title, summary, description, screenshots, and promo images.
- Do not repeat terms like YouTube, Music, Telegram, party, bot, queue, or playback unnaturally.
- Do not imply affiliation with YouTube, Google, Chrome, or Telegram.
- Ensure screenshots show the actual extension UI and real usage flow, not misleading marketing-only screens.
- Use one clear single-purpose description across the listing and Privacy page.
- Avoid using competitor/product logos as the main icon unless usage follows branding guidelines.
- Make the description factual and feature-focused, not promotional or manipulative.
- If resubmitting the same package, update listing text/assets first and explain the changes in the appeal or reviewer notes.

Suggested reviewer note:

```text
This extension has one purpose: connecting a user's YouTube Music tab to a Telegram-controlled party room for shared playback and queue control. The listing has been updated to avoid promotional repetition, clarify that the project is not affiliated with YouTube, Google, Chrome, or Telegram, and accurately describe the extension's functionality and data usage.
```
