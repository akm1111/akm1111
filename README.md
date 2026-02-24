# FC 26 SBC Automator (Chrome Extension)

A downloadable Chrome extension that automates deterministic SBC completion loops in the FC 26 Ultimate Team Web App after you manually navigate to **SBCs → Favourites**.

## What this delivers

- Runs on **Google Chrome** as an unpacked extension.
- Popup UI includes:
  - **Exact SBC name** input.
  - **Start** button.
  - **Stop** button (instant stop flag).
  - **Loop** toggle (ON by default).
- DOM/text-based automation only (no coordinates, no fixed sleep delays).
- Verifies exact SBC text and context before interaction.
- Required loop:
  1. PASS 1 (Common Gold)
  2. Adjustment (remove exactly 3 players with visual confirmation)
  3. PASS 2 (Rare Gold)
- Hard safety behavior:
  - Blocks submit unless requirements are met.
  - Confirms submission success explicitly.
  - Stops immediately on any critical error.
  - Stops when SBC expires or eligible players are exhausted.

## Install

1. Download this folder.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this folder.

## Run

1. Open FC 26 Web App in Chrome and log in.
2. Navigate to **SBCs → Favourites**.
3. Open extension popup.
4. Enter the exact SBC name as displayed.
5. Keep Loop enabled (default) unless you want one cycle only.
6. Press **Start**.
7. Press **Stop** any time to halt immediately.

## Project files

- `manifest.json` — MV3 manifest and permissions.
- `popup.html`, `popup.css`, `popup.js` — user controls + log view.
- `background.js` — tab-level orchestration and event relay.
- `content.js` — core automation engine and safety enforcement.
