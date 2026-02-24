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


## Troubleshooting

- **Automation stopped: Failed to enable Ignore Position**
  - Open Squad Builder once manually and verify the **Ignore Position** control is visible.
  - The extension now retries multiple clickable wrappers for this toggle, but if EA changes labels/styles you may need to refresh and retry.

- **Automation stopped: Could not open SBC after click attempts**
  - The Web App sometimes nests the clickable tile inside multiple wrappers.
  - Re-open **SBCs → Favourites**, and confirm the SBC card is visible before pressing **Start**.
  - Try entering the base SBC name (for example `81+ Player Pick`) even if card text shows `1 of 3 ...`.

- **Automation stopped: Timed out waiting for UI state**
  - New builds include the failing step in the error message to pinpoint where it stopped.
  - This usually means the SBC card did not actually open or the page labels changed.
  - Confirm you are on **SBCs → Favourites** and the SBC name matches exactly.
  - Click the SBC manually once to verify it opens, then press **Start** again.

- **Popup shows “Automation running...” but nothing happens**
  - Make sure the FC Web App tab is active and still on **SBCs → Favourites**.
  - Keep the tab in foreground for the first run so UI transitions can be detected.
  - Open the extension popup to see live step messages (e.g. "Pass #1", "Submission confirmed").

- **Start failed: Could not establish connection. Receiving end does not exist.**
  - Make sure the active tab is the FC Web App page.
  - Refresh the FC Web App tab once, then press **Start** again.
  - If needed, close and reopen the extension popup and retry.


## Standalone Web App Mode (No Extension)

If you prefer not to use a Chrome extension, you can run the standalone in-page app:

- Script: `standalone/fc26-sbc-webapp.js`
- Guide: `standalone/README.md`

This mode injects a dashboard directly into the FC26 Web App tab with Start/Stop, recovery controls, and runtime logs.
