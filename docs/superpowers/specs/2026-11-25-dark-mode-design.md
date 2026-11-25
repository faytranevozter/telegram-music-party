# Dark mode across Music Party

## Intent and scope

Make every Music Party interface readable in light and dark environments without changing layouts or room behavior. Cover the web room client (create, join, and in-room views), the public landing site (home, gallery, support, privacy, terms, and not-found pages), the browser extension popup, the extension's controls and join dialog inside YouTube Music, and the backend's public information page. Telegram's appearance remains controlled by Telegram.

## Approaches

- **System only:** Least UI and storage work, but people cannot choose a theme independently of their device.
- **System with a manual override (selected):** Standalone surfaces offer System, Light, and Dark. This gives people a choice without involving accounts, room settings, or server state. Embedded controls match YouTube Music rather than carrying a second switch.

## Behavior

- Use a labeled **Appearance** control available to everyone on standalone surfaces, including invited guests and users who have not joined a room. Place it in the web app header, in consistent page chrome on the public site and backend page, and in the extension popup settings.
- Default to **System**. Follow live device appearance changes in System mode; ignore those changes while explicitly set to Light or Dark. Apply changes immediately without reloading.
- Store only the preference in browser-local storage. Landing pages share a preference on their origin; the web client, backend page, and popup use their own local preference. No cross-origin or cross-device sync, new extension permission, or backend change to room state. Missing, invalid, or unavailable storage falls back to System on a new page load; switching still works for the current page.
- Apply the theme before the first paint where possible, using packaged scripts where extension policy disallows inline scripts. Standard browser controls should have the matching `color-scheme`.
- Injected controls use YouTube Music's page theme where detectable, update when it changes, and retain the current dark appearance as a fallback. They never recolor YouTube Music itself.

## Visual and technical direction

Keep the existing web and public-site light palettes and the popup's established dark palette as starting points. Add complementary palettes using the web client's daisyUI theme tokens, the landing and server pages' CSS custom properties, and the popup's HeroUI theme plus local CSS tokens. Keep meaningful status colors, visible keyboard focus, and legible control text in both palettes. Do not tint album art, screenshots, logos, or QR codes. Update the shared legal generator so regenerated pages keep the preference control.

## Acceptance

- Test first load, all three choices, refresh/reopen persistence, OS changes, and safe fallback with blocked or invalid storage.
- Check the room as host and guest, public pages including a generated legal route, the backend page, and popup open/reopen in a real browser. Verify the injected join UI matches the host page and stays usable on theme changes.
- Verify mobile layouts, keyboard access, contrast for text and controls, and no obvious wrong-theme flash. Run the affected test, lint, build, and legal-generation commands. No rollout or deployment is part of implementation.
