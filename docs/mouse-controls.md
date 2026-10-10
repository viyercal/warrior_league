# Mouse controls and play sharing

Implemented October 10, 2026.

- Settings and pause include a saved 0.25× to 2× mouse sensitivity slider and Reset. This controls camera parallax, War Rift edge scrolling, and Forge dragging. Raw cursor aiming and click destinations retain their screen alignment.
- The Pit, Last Bastion, and Blood Court accept right-click destinations with a visible ring. Existing War Rift move/attack orders remain available. Keyboard movement takes over immediately. Pause, focus loss, death, results and cinematics clear the new navigation orders.
- Last Bastion routes around the citadel. Blood Court retains basket-directed shooting; Mortal Arena and racing retain directional controls. The Crucible now supports right-click walking in both Tower and Single Duel (see duel-mouse-results.json).
- `tools/serve-game.py` serves only `dist` on loopback for Cloudflare. Directory listings, dotfiles, external symlinks and directory-index symlink escapes are blocked.

## Verification checklist

- [x] Production build passes (existing large entry-chunk warning remains).
- [x] Native slider input, keyboard minimum/maximum, reset, immediate runtime effect and reload persistence.
- [x] Desktop 1440×900, tablet 900×800 and mobile 390×844 layout, screenshot inspection and reset interaction.
- [x] Invalid preference fallback and out-of-range clamping.
- [x] Camera input, actual Forge dragging and War Rift edge scrolling scale correctly. Cursor coordinates stay unchanged.
- [x] Actual right-click movement in arena, siege, hoops and existing moba.
- [x] Arrival, destination marker clearing, keyboard takeover, pause cancellation and help text in all three newly supported scenes.
- [x] Cursor aiming and left-button firing in arena and siege.
- [x] Focus-loss pause, in-game sensitivity edits, and match-end destination cleanup in arena, siege and hoops.
- [x] Citadel detour traversal, plus 2,000 deterministic routes checked by an independent reviewer.
- [x] Independent adversarial controls review, static-server review, verified index-symlink fix and reviewer recheck.
- [x] Public Chrome boot, entry, saved settings, assets and actual gameplay pass with zero browser errors.
- [x] Public HTTP response is 200; `.git/config` and `src/main.js` return 404.

Evidence: [controls](mouse-controls-results.json), [sensitivity](mouse-sensitivity-results.json), [lifecycle](mouse-lifecycle-results.json), [public browser check](public-game-results.json), [desktop](screenshots/mouse-settings-desktop.png), [mobile](screenshots/mouse-settings-mobile.png).

The new controls were tested in the current Chrome environment. No test was performed on the friend's physical laptop. This is single-player browser access, not network multiplayer. Existing whole-game QA records remain in their respective production documents.

## Current sharing process ownership

This task created two user LaunchAgents, `com.vivekiyer.warrior-league.server` and `com.vivekiyer.warrior-league.tunnel`. The server uses loopback port 5189. Their task-owned plists and logs are in `/tmp/warrior-league-share-20261010/`. They run independently of the interactive shell and restart on process failure during this login session. They are not installed for startup after reboot. Cloudflare may issue a different URL when its process restarts.

To stop this exact sharing session:

```bash
launchctl bootout gui/$(id -u)/com.vivekiyer.warrior-league.tunnel
launchctl bootout gui/$(id -u)/com.vivekiyer.warrior-league.server
```

The host Mac must remain awake and online. No overnight agent supervision is configured or claimed.

## Crucible movement and War Rift fountain follow-up

- Right-click the Crucible arena to walk horizontally to a marked destination in Tower or Single Duel. Picking intersects the fighting lane, so clicking above the floor still selects the intended horizontal spot. Movement respects arena limits and stops at grounded opponents. Keyboard movement, combat actions, block, crouch, jump, pause, focus loss and round/result transitions cancel the order.
- War Rift's allied fountain restores living players to their current maximum health immediately, including when entering by click-to-move. The area follows the bronze platform ring, radius 6.75 at x = -48. Damage while remaining inside is restored without repeated audio or floating text. The enemy fountain, dead players and completed matches do not receive healing.
- Verification: production build; independent code review; browser checks for both Crucible modes, forward/retreat arrival, opponent contact, keyboard/combat interruption, UI isolation and round cleanup; fountain entry by both input methods, radial boundaries, enemy/dead/end states and levelled health; updated help inspected at 1440, 900 and 390 pixels. No browser errors in the local checks.
- Evidence: [Crucible browser results](duel-mouse-results.json), [fountain browser results](fountain-results.json), and [public deployment checks](controls-public-results.json).
