# Now Playing artwork gradient

Tint only the web room's Now Playing card with a dark gradient derived from the current track's displayed artwork. Favor a muted artwork hue near the cover, fading toward near-black behind the controls. Keep the existing layout, text, and controls. When the player is offline, no track is playing, or artwork cannot be sampled, keep the current neutral background. Never retain the previous track's color while the next track loads.

## Approaches

- **Selected: sample the artwork palette.** Render a clean gradient from the sampled color, dark enough for the existing light foreground. For the red *Begadang* cover this means burgundy fading into near-black.
- **Not selected: blur the artwork behind the card.** Avoid visual noise and unpredictable text contrast caused by image detail.

Use the cover source already available to the browser (currently a YouTube thumbnail for Now Playing); do not add metadata lookups, change playback, or route artwork through the backend. If the source changes or fails, use the neutral card until a usable color is available.
