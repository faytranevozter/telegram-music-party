#!/usr/bin/env bash
# Render Chrome Web Store graphic assets into docs/images/store/.
#
# Usage: scripts/render-store-assets.sh
# Requires: Google Chrome at /Applications/Google Chrome.app (or CHROME env var).
set -euo pipefail

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
out="$root/docs/images/store"
shots="$root/docs/images/screenshot"
icon="$root/apps/extension/public/app-icon.png"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

if [ ! -x "$chrome" ]; then
    echo "error: Chrome not found at $chrome (set CHROME=/path/to/chrome)" >&2
    exit 1
fi

mkdir -p "$out"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cp "$icon" "$tmp/icon.png"
cp "$shots/ext-01.png" "$tmp/popup-queue.png"
cp "$shots/ext-02.png" "$tmp/popup-playing.png"

# --- 1280x800 screenshot layout -------------------------------------------
SCREENSHOT_LAYOUT='<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:1280px; height:800px; overflow:hidden; }
body {
  font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: radial-gradient(1100px 680px at 10% 4%, #1a2846 0%, #0c1322 44%, #070b13 100%);
  color:#e8ecf5; position:relative;
}
.glow { position:absolute; width:640px; height:640px; border-radius:50%;
  background:radial-gradient(circle, rgba(37,99,235,.26) 0%, rgba(37,99,235,0) 68%); left:-170px; top:-180px; }
.glow2 { position:absolute; width:520px; height:520px; border-radius:50%;
  background:radial-gradient(circle, rgba(22,163,74,.18) 0%, rgba(22,163,74,0) 70%); right:-150px; bottom:-180px; }
.wrap { position:relative; z-index:2; display:flex; height:100%; }
.left { width:700px; padding:66px 0 0 76px; display:flex; flex-direction:column; }
.brand { display:flex; align-items:center; gap:13px; }
.brand img { width:50px; height:50px; border-radius:11px; }
.brand .btxt { font-size:20px; font-weight:640; color:#c6d2e4; }
h1 { margin-top:30px; font-size:50px; line-height:1.09; font-weight:760; letter-spacing:-0.028em; max-width:620px; }
h1 .accent { color:#60a5fa; }
.sub { margin-top:18px; font-size:20px; line-height:1.5; color:#93a2bb; max-width:560px; }
.features { margin-top:30px; display:flex; flex-direction:column; gap:13px; }
.feat { display:flex; align-items:flex-start; gap:12px; font-size:17.5px; color:#c3cede; }
.feat .dot { width:23px; height:23px; flex:0 0 23px; border-radius:50%;
  background:rgba(37,99,235,.18); border:1px solid rgba(96,165,250,.45);
  display:flex; align-items:center; justify-content:center; font-size:12.5px; color:#7dd3fc; font-weight:700; margin-top:1px; }
.foot { margin-top:auto; padding-bottom:42px; display:flex; flex-direction:column; gap:12px; }
.pill { display:inline-flex; align-items:center; gap:8px; align-self:flex-start;
  background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10);
  border-radius:999px; padding:7px 14px; font-size:14px; color:#a9b6cb; }
.pill .g { width:8px; height:8px; border-radius:50%; background:#22c55e; }
.fine { font-size:13.5px; color:#5b6a80; }
.right { width:580px; display:flex; align-items:center; justify-content:center; padding:40px 0; }
.shot { width:372px; border-radius:15px; overflow:hidden; background:#000;
  border:1px solid rgba(255,255,255,.12);
  box-shadow:0 40px 90px rgba(0,0,0,.62), 0 0 0 1px rgba(255,255,255,.04); }
.shot img { display:block; width:100%; }
.bar { height:30px; background:#161b26; display:flex; align-items:center; gap:7px; padding:0 12px;
  border-bottom:1px solid rgba(255,255,255,.07); }
.bar i { width:10px; height:10px; border-radius:50%; background:#2b3242; display:block; }
</style></head><body>
<div class="glow"></div><div class="glow2"></div>
<div class="wrap">
  <div class="left">
    <div class="brand"><img src="ICON_SRC" alt=""><div class="btxt">YouTube Music Party</div></div>
    <h1>One tab. One room.<br><span class="accent">Whole group listening.</span></h1>
    <div class="sub">Connect a YouTube Music tab to a room and let everyone control the queue together.</div>
    <div class="features">
      <div class="feat"><span class="dot">1</span><span>Join a room from the music page</span></div>
      <div class="feat"><span class="dot">2</span><span>Play, pause, skip, and set volume</span></div>
      <div class="feat"><span class="dot">3</span><span>Watch the queue update live</span></div>
    </div>
    <div class="foot">
      <span class="pill"><span class="g"></span>Connected</span>
      <span class="fine">Not affiliated with YouTube, Google, Chrome, or Telegram.</span>
    </div>
  </div>
  <div class="right"><div class="shot">
    <div class="bar"><i></i><i></i><i></i></div>
    <img src="SHOT_SRC" alt="">
  </div></div>
</div>
</body></html>'

# --- 440x280 promo tile layout -------------------------------------------
PROMO_LAYOUT='<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:440px; height:280px; overflow:hidden; }
body {
  font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: radial-gradient(520px 340px at 12% 6%, #1c2c4e 0%, #0d1424 46%, #080c15 100%);
  color:#e8ecf5; position:relative;
}
.glow { position:absolute; width:300px; height:300px; border-radius:50%;
  background:radial-gradient(circle, rgba(37,99,235,.32) 0%, rgba(37,99,235,0) 68%); left:-110px; top:-110px; }
.wrap { position:relative; z-index:2; padding:26px 30px; display:flex; flex-direction:column; height:100%; }
.brand { display:flex; align-items:center; gap:10px; }
.brand img { width:30px; height:30px; border-radius:7px; }
.brand .btxt { font-size:13px; font-weight:620; color:#b8c5da; letter-spacing:0.01em; }
h1 { margin-top:22px; font-size:34px; line-height:1.12; font-weight:760; letter-spacing:-0.025em; }
h1 .accent { color:#60a5fa; }
.sub { margin-top:12px; font-size:14.5px; line-height:1.45; color:#8b9ab3; max-width:340px; }
.foot { margin-top:auto; display:flex; align-items:center; gap:8px; }
.pill { display:inline-flex; align-items:center; gap:7px;
  background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.11);
  border-radius:999px; padding:5px 11px; font-size:12px; color:#a9b6cb; }
.pill .g { width:7px; height:7px; border-radius:50%; background:#22c55e; }
</style></head><body>
<div class="glow"></div>
<div class="wrap">
  <div class="brand"><img src="ICON_SRC" alt=""><div class="btxt">YouTube Music Party</div></div>
  <h1>One tab. One room.<br><span class="accent">Shared listening.</span></h1>
  <div class="sub">Let a Telegram group control the YouTube Music queue.</div>
  <div class="foot"><span class="pill"><span class="g"></span>Connected</span></div>
</div>
</body></html>'

render() {
    # $1 = layout html, $2 = shot file, $3 = output png, $4 = width, $5 = height
    python3 - "$tmp" "$1" "$2" <<'PY'
import sys, pathlib
tmp = pathlib.Path(sys.argv[1])
html = pathlib.Path(sys.argv[2]).read_text()
html = html.replace("ICON_SRC", (tmp / "icon.png").as_uri())
html = html.replace("SHOT_SRC", (tmp / sys.argv[3]).as_uri())
(tmp / "render.html").write_text(html)
PY
    "$chrome" --headless --disable-gpu --hide-scrollbars \
        --force-device-scale-factor=1 \
        --screenshot="$3" --window-size="$4,$5" \
        "file://$tmp/render.html" 2>/dev/null
    echo "rendered $(basename "$3") ($4x$5)"
}

# Write layouts to temp files
printf '%s' "$SCREENSHOT_LAYOUT" >"$tmp/screenshot.html"
printf '%s' "$PROMO_LAYOUT" >"$tmp/promo-tile.html"

render "$tmp/screenshot.html" "popup-queue.png"   "$out/screenshot-01-queue.png"   1280 800
render "$tmp/screenshot.html" "popup-playing.png" "$out/screenshot-02-playing.png" 1280 800
render "$tmp/promo-tile.html" "popup-playing.png" "$out/small-promo-440x280.png"   440 280

cp "$icon" "$out/icon-128x128.png"
echo "copied icon-128x128.png"

echo "Done. Assets in docs/images/store/"
