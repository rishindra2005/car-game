# Player Guide

Welcome to **Velocity Rush** — an original night-time street-racing game that runs in your
browser. Everything you see and hear (cars, city, music) is generated procedurally; no
real-world car makes or brands appear.

## Getting started

1. Open the game (see the [README](../README.md) for running it locally).
2. Click anywhere / press a key on the title screen — browsers only allow audio after a user
   gesture, so this also starts the sound.
3. From the **main menu** choose:
   - **Career** — the story mode; your progress is saved automatically.
   - **Quick Race** — jump straight into a race on any unlocked track.
   - **Settings** — resolution, quality, renderer, audio.
4. The race starts after a 3-2-1 countdown. Hold throttle early for a better launch.

Controls are listed in [CONTROLS.md](CONTROLS.md). Short version: **W/↑** accelerate,
**S/↓** brake, **A/D** or **←/→** steer, **Space** handbrake, **Shift** nitro, **R** reset car.

## Career

The career is split into four acts (chapters): the Harbor Loop, the Downtown Grid, the Canyon Run & Industrial Zone, and the Skyline Sprint, each ending with a boss race. You start with $12,000. Each act has a set of events on the city map; finish
events to earn money and reputation, unlock the next events and chapters, and move the story
forward through dialogue scenes with an original cast of characters.

- Events show their **type, track, reward and requirements** (e.g. minimum car class)
  before you start.
- Finishing position determines the payout; some events also have bonus **objectives**.
- Progress is saved in your browser (`localStorage`, key `velocityRush.save.v1`). Clearing
  site data resets the career.

The full story, chapter by chapter, is in the [Story Walkthrough](story-walkthrough.md)
(contains spoilers).

## Garage and cars

The **Garage** holds the cars you own. You can buy new cars with career money. Cars are
grouped into classes **D → C → B → A → S** (slowest to fastest); higher-tier events require
higher classes. Body styles include hatch, coupe, muscle, SUV and supercar, each with
different weight, power, grip and top speed.

### Upgrades

Each car can be upgraded in four categories, each with three levels (prices rise per level):

| Upgrade | Effect |
|---------|--------|
| Engine  | more power → acceleration and top speed |
| Tires   | more grip → cornering and braking |
| Nitro   | larger/stronger nitro boost |
| Weight  | weight reduction → better acceleration and handling |

Upgrades are bought per car and apply immediately. A fully upgraded car of a lower class
can sometimes keep up with a stock car of the next class.

## Race modes

| Mode | Goal |
|------|------|
| **Circuit**    | Multi-lap race against rivals. Finish first. |
| **Sprint**     | Point-to-point race; one run through the course. |
| **Drift**      | Score points by sliding. Longer, faster, uninterrupted drifts build a multiplier; hitting a wall ends the chain. Highest score wins. |
| **Time Trial** | Just you and the clock. Beat the target lap time. |
| **Pursuit**    | Police are on your tail. Survive / evade until you escape — getting **busted** fails the event. |
| **Knockout**   | Elimination: the last-placed driver is knocked out at the end of each lap until one remains. |

Checkpoints are counted along the track; driving the wrong way shows a **WRONG WAY** warning,
and skipped checkpoints do not count.

## Heat and police

Reckless driving at high speed and crashing into traffic raises your **heat level (0–5)**,
shown by the heat meter on the HUD.

- At higher heat, more police units join and they drive more aggressively, trying to box you in.
- If you are stopped (or nearly stopped) near police for a few seconds, you are **BUSTED**.
- Break line of sight and keep moving to let the **escape** meter fill; when it does, you
  escape and heat cools down.
- In Pursuit events, escaping is the goal; in normal races police are a hazard.

## Nitro

Nitro charges up from driving fast, drifting and near-misses. Hold **Shift** to burn it for a
strong speed boost. Using it in a straight line is most effective; using it mid-corner will
push you wide.

## Tips

- **Brake before the corner, not in it.** Release the brake as you turn in, and get back on
  the throttle at the apex.
- **Handbrake** is for tight hairpins and starting drifts — tap it, don't hold it.
- In drift events, keep the car sideways with throttle and counter-steer; touching walls
  resets your combo.
- Save nitro for the longest straight on the lap, or to defend a position at the end.
- Rivals use rubber-banding: a big lead can shrink, so keep pushing to the finish.
- Traffic drives in both directions. The center of your lane is usually the safest gap.
- Change camera with **C** — the hood/bumper views feel faster, chase view shows more of the road.
- If you get stuck or flipped, press **R** to reset onto the track.
- Running slowly? See [Graphics & Performance](GRAPHICS_AND_PERFORMANCE.md).
- Take screenshots with **Photo Mode** (**P**) — let it refine for a few seconds for a clean image.
