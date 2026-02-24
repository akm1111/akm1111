# FC 26 Web App SBC Automation (Chrome Extension)

This repository contains a Manifest V3 Chrome extension that automates repeat SBC completion loops in the FC 26 Ultimate Team Web App.

## Features

- Popup UI with:
  - Exact SBC name input
  - Start button
  - Stop button (instant stop)
- Targets SBC by visible exact text name.
- Fully automated loop once started:
  1. Common Gold build + submit
  2. Remove exactly 3 players
  3. Rare Gold build + submit
  4. Re-open same SBC and repeat
- Safety checks before submission:
  - Requirements state check
  - Submit button enabled check
  - Submission success confirmation check
- Fail-safe behavior:
  - Stops immediately on critical errors
  - Logs reason to console and popup status

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Open FC 26 Web App and log in.
6. Navigate to **SBCs → Favourites**.
7. Open extension popup:
   - Enter exact SBC name.
   - Click **Start**.

## Usage Notes

- The automation is DOM/text-driven (no coordinate clicking).
- The automation uses state-based waits (MutationObserver + render-frame checks), not static fixed delays.
- If the Web App UI class names or labels change, selectors may need adjustment in `content.js`.

## Stop Conditions

The loop stops when:

- You click **Stop**
- SBC is unavailable/expired
- Eligible players are insufficient
- Any critical validation or interaction error occurs
