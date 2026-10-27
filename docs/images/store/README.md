# Chrome Web Store Graphic Assets

Ready-to-upload assets for the Chrome Web Store listing.

| File | Size | Upload field |
|------|------|--------------|
| `icon-128x128.png` | 128x128 | Store icon |
| `screenshot-01-queue.png` | 1280x800 | Screenshot — popup with queue |
| `screenshot-02-playing.png` | 1280x800 | Screenshot — popup, now playing |
| `small-promo-440x280.png` | 440x280 | Small promo tile |

The two screenshot files and the promo tile are the **only** sizes Chrome Web Store
accepts. Do not re-export them at other dimensions.

## Sources

- `icon-128x128.png` — copy of `apps/extension/public/app-icon.png`
- Popup screenshots are compositions of `docs/images/screenshot/ext-01.png`
  (queue) and `ext-02.png` (now playing), placed in a branded frame.

## Regenerating

The assets are rendered with headless Chrome from HTML templates, so text stays
crisp at every size.

```bash
# from repo root
./scripts/render-store-assets.sh
```

Requirements: Google Chrome installed at `/Applications/Google Chrome.app`.

## Templates

The script builds its HTML inline. To tweak the look, edit the layout in
`scripts/render-store-assets.sh` — the two layouts are:

- `SCREENSHOT_LAYOUT` — 1280x800, text on the left, extension popup on the right.
- `PROMO_LAYOUT` — 440x280, compact text-only card.

Both use a dark gradient background, the store icon, and a "Connected" status
pill. Copy is deliberately short and factual — Chrome Web Store reviewers reject
listings that read like marketing copy.
