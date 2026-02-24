# FC26 SBC Standalone Web App (In-Page)

This is a standalone in-page web app (not a Chrome extension) that you run directly inside the FC26 Web App tab.

## Run

1. Open FC26 Ultimate Team Web App in Chrome and go to **SBCs → Favourites**.
2. Open DevTools Console.
3. Paste the full contents of `standalone/fc26-sbc-webapp.js` and press Enter.
4. Use the dashboard (top-right):
   - Enter exact SBC name
   - Start / Stop
   - Manual Recover

## Self-healing behavior

- Detects missing elements, timing delays, and view drift.
- Retries each step with bounded attempts.
- Runs targeted recovery (re-enter favourites/challenge/builder).
- Pauses safely if unrecoverable, then attempts auto-resume checks.
- Logs all failures and recovery actions in dashboard + console.

## Safety

- Bounded retries (no infinite loops).
- Submit is blocked when requirements fail or submit is disabled.
- If unrecoverable, it pauses instead of forcing risky actions.
