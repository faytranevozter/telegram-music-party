# DaisyUI appearance and public pages

Replace the appearance dropdown with one keyboard-operable daisyUI Swap button across the web room, extension popup, landing routes (including 404), and backend info page. Each activation advances **System → Light → Dark → System**. Show a monitor, sun, or moon and the selected mode in text; expose the current and next mode to assistive technology. Keep saved choices, live system updates, separate storage keys, and early theme application. The injected YouTube Music UI stays host-themed; Telegram is unchanged.

## Approaches

- **Use daisyUI Swap with the existing controller (approved).** A native button controls the three choices, while daisyUI handles the icon transition. One locally bundled component suffices for the HeroUI popup.
- **Use a checkbox-only theme controller.** Simpler markup, but it removes the approved System mode or forces it into a separate control.
- **Load the full daisyUI bundle on every page.** Less build setup, but adds unnecessary styles to the popup and is not needed for local, scoped delivery.

## Public-page design

- **Landing site:** `[Brand · navigation · appearance]` above `[Headline / install / setup | real player screenshot]`, then shared queue features, setup, hosting, and community. Use a real player screenshot as the main visual, not a decorative illustration. Use consistent navigation and daisyUI buttons, cards, and alerts where they help across the gallery, support, generated legal pages, and 404. Preserve screenshots, links, and legal text.
- **Backend info:** `[Brand · appearance]` above `[Server URL | Copy server URL]`, then connection instructions and support/self-hosting links. This is an address handoff, not a health dashboard. Preserve copy feedback, manual fallback, and reverse-proxy mount paths.
- **Tokens:** Keep the existing music-party identity: paper `#FFFFFF`, tint `#EEF2F7`, ink `#20242C`, night `#151922`, cobalt `#2845C7`, and periwinkle `#ADC2FF`. Keep locally hosted Bricolage Grotesque for headings and system sans for UI. Use left-aligned text and allow layouts to stack at narrow widths. Preserve visible focus and respect reduced motion.
- Ship compiled styles locally with no CDN dependency. Keep HeroUI for the rest of the popup. Do not change room or backend behavior, add extension permissions, push, or deploy.
