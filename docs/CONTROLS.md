# Controls

Velocity Rush supports keyboard and any controller exposed through the browser
[Gamepad API](https://developer.mozilla.org/docs/Web/API/Gamepad_API) (Xbox-/PlayStation-style
"standard" mapping). Keyboard and gamepad can be used at the same time; the larger input wins.

## Keyboard

| Action            | Keys                    |
|-------------------|-------------------------|
| Throttle          | `W` / `Arrow Up`        |
| Brake / reverse   | `S` / `Arrow Down`      |
| Steer left        | `A` / `Arrow Left`      |
| Steer right       | `D` / `Arrow Right`     |
| Handbrake         | `Space`                 |
| Nitro             | `Shift` (either)        |
| Change camera     | `C` (chase → hood → bumper → cinematic) |
| Photo Mode        | `P` (toggle)            |
| Pause / back      | `Esc`                   |
| Reset car to track| `R`                     |

Keyboard steering is digital, so it is smoothed over a few frames to avoid twitchy
inputs at speed. Holding brake while stopped engages reverse.

## Gamepad (standard mapping)

| Action          | Control                                  |
|-----------------|------------------------------------------|
| Steer           | Left stick (X axis), with a small dead zone |
| Throttle        | Right trigger (RT / R2), analog          |
| Brake / reverse | Left trigger (LT / L2), analog           |
| Handbrake       | A / Cross                                |
| Nitro           | B / Circle (or X / Square)               |
| Change camera   | Y / Triangle                             |
| Pause           | Start / Options                          |
| Reset car       | Back / Share (Select)                    |

Exact face-button assignments are defined in `src/game/input.js`; if your controller
reports a non-standard mapping (`gamepad.mapping !== 'standard'`), buttons may differ.
Browsers only expose a gamepad after you press a button on it while the page has focus.

## Menus

Menus are DOM overlays and can be operated with the mouse. `Esc` closes the current
menu / returns to the previous screen and pauses or resumes during a race.

## Photo Mode

Press `P` during a race to freeze gameplay and enter Photo Mode. The image refines
progressively while the camera is still; press `P` again to return to the race.
See [GRAPHICS_AND_PERFORMANCE.md](GRAPHICS_AND_PERFORMANCE.md#photo-mode).
