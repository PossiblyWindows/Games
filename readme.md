# Reflex Dodger

Reflex Dodger is a fast-paced browser dodging game built for quick reflexes and high-score chases.

## Playing

1. Open `client/index.html` in any modern desktop browser.
2. Start the round and move using the **WASD** or **Arrow** keys.
3. Dodge every hazard — a single collision ends the run.

## Project structure

- `client/` — HTML, CSS, and JavaScript that power the game interface.
Reflex Dodger is a fast-paced browser dodging game with an aggressive client-side anti-cheat system.

## Playing

1. Open `index.html` in any modern desktop browser.
2. Start the round and move using the **WASD** or **Arrow** keys.
3. Dodge every hazard — a single collision ends the run.

## Anti-cheat measures

The client is guarded by several protections:

- Developer tools monitoring with multiple heuristics (window geometry changes and console bait).
- Shortcut interception (`F12`, `Ctrl`/`Cmd` + `Shift` dev-tool combos) and context menu suppression.
- Refresh pattern detection and storage-backed session bans that persist across reloads.
- Tamper checks for critical APIs such as `Math.random`.

Detected tampering replaces the entire interface with a permanent ban screen summarizing the captured events.
