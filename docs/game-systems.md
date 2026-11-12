# Game Systems (src/game, src/ui, src/audio)

## Modules & API

| File | Exports |
|---|---|
| `game/story.js` | `STORY` { title, prologue[], acts[4] {id, chapter, title, subtitle, boss, intro[], outro[]}, twist }, `CHARACTERS`, `EVENT_DIALOGUE` { [eventId]: {pre[], post[]} }, `getAct(ch)`, `getEventDialogue(id)`. A line is `{ speaker: characterId, text }`. |
| `game/events.js` | `EVENTS` (21 events), `EVENT_TYPES`, `TRACK_IDS`, `CHAPTERS`, `ACT_BOSSES` {1..4: {characterId, name, crew, eventId, carClass}}, `getEvent(id)`, `eventsForChapter(ch)`, `isEventPassed(event, results)`, `computeReward(event, results)` |
| `game/career.js` | `Career`, `MemoryStorage`, `SAVE_KEY` (`velocityRush.save.v1`), `START_MONEY`, `MAX_CHAPTER` |
| `game/challenges.js` | `CHALLENGES`, `evaluateChallenge(ch, stats)`, `evaluateAll(stats)`, `dailyChallenges(date)`, `newlyCompleted(stats, claimed)` |
| `game/race.js` | `RaceSession` |
| `game/input.js` | `Input` |
| `game/camera.js` | `ChaseCamera`, `CAMERA_MODES` |
| `ui/hud.js` | `HUD`, `formatTime(t)` |
| `ui/menus.js` | `Menus`, `DEFAULT_SETTINGS`, `RESOLUTIONS`, `TRAFFIC_LEVELS` |
| `audio/audio.js` | `AudioSystem` |

### Event shape
`{ id, name, chapter, type, trackId, laps, rivals, difficulty 0..1, boss (characterId|null), side?, reward:{money, rep, car?}, requirements:{events?:[ids], reputation?}, objectives:[string], winPlace?, targetTime?, targetScore?, surviveTime? }`

## Career & economy
- The save lives in `localStorage[velocityRush.save.v1]`. If localStorage is unavailable (private mode, node), the career falls back to an in-memory store. It saves automatically after every change.
- `new Career({storage?})`, `load()`, `save()`, `reset()`, `ensureStarter(CARS)` (gives you the cheapest car), `buyCar(car)`, `selectCar(id)`, `buyUpgrade(carId, type, UPGRADES)`, `getUpgrades(carId)`, `isEventUnlocked(ev|id)`, `availableEvents()`, `unlocked` (ids), `completeEvent(id, place, time, extra?)`, `recordStats(raceStats)`, `isStoryComplete`.
- **Rewards:** circuit, sprint and knockout pay by place: 1st 100%, 2nd 60%, 3rd 40%, otherwise 15%. Drift, time trial and pursuit pay 100% if passed and 10% otherwise. Being busted or eliminated pays 10%. Repeat wins pay 50% of the reward.
- **Unlocks:**
  - Each event needs its chapter unlocked plus the events listed in `requirements.events`.
  - Winning the act boss (`ACT_BOSSES[ch].eventId`) unlocks the next chapter.
  - Car classes unlock by chapter: D/C in ch1, B in ch2, A in ch3, S in ch4.
  - Upgrade level N needs chapter ≥ N.
- `stats` covers races, wins, topSpeed (km/h), bestDrift, escapes, distance (m), nitroTime (s) and cleanLaps. Challenges read from it.

## RaceSession
`new RaceSession({ engine, event, track, playerCar, rivals=[], police?, onEvent?(type,data), countdown=3 })`
- Racer bodies only need `position` and `speed`. Rivals may be `RivalDriver`s (which have `.physics`) or bodies, with an optional `.name`.
- **Countdown:** `countdownText` goes '3','2','1','GO'. Driving starts when `canDrive` is true. Read `countdown` events through `onEvent`.
- **Progress:** each racer's `track.progressAt(pos)` delta is wrapped into [-0.5, 0.5] and accumulated into an unwrapped `raw` progress. Grid slots behind the line start negative.
  - Checkpoints (`track.checkpoints` or [.25,.5,.75]) must be passed in order. A lap counts only once every checkpoint is passed and raw ≥ lapsDone + 1.
  - So reversing over the line and teleporting don't count as laps.
- **Positions** are ordered: finished (in finish order), then active racers (by raw progress, descending), then eliminated racers.
- **Wrong way:** set when progress keeps decreasing for more than 1 s at a speed above 2 m/s.
- **Modes:**
  - **drift:** uses `playerCar.driftScore` (as a delta) if it is a number. Otherwise it builds its own score from `drifting` × speed × a combo multiplier of up to 5.
  - **knockout:** when every active racer except one has completed k laps, the remaining racer is eliminated. The last car standing wins, and the race ends at once if the player is eliminated.
  - **timeTrial:** passed if `time <= targetTime`.
  - **pursuit:** wire `police.onBusted`/`onEscaped`, or call `notifyBusted()`/`notifyEscaped()`. You survive by reaching `surviveTime`.
- `results` = `{ eventId, type, place, time, lapTimes, bestLap, score, survived, escaped, busted, eliminated, passed, targetTime, targetScore, standings[{name,isPlayer,place,time,bestLap,eliminated}], stats{topSpeed,distance,nitroTime,bestDrift} }`
- `hudState()` returns an object you can pass straight to `HUD.update`, merged with the vehicle data.
- `abort()` ends the race as a DNF.

## Input
`new Input(target=window)`. `state = {throttle, brake, steer, handbrake, nitro}`. Call `update(dt)` once per frame.
- **Keyboard:** WASD/arrows, Space (handbrake), Shift (nitro). Keyboard steering is ramped.
- **Gamepad (standard mapping):** RT throttle, LT brake, left stick steer, X/RB handbrake, A/LB nitro.
- **Actions:** `on('camera'|'photo'|'pause'|'reset'|'map', fn)` and `wasPressed(name)`. The keys are C, P, Esc, R and M; gamepad Y, Back, Start and B also trigger actions. Set `enabled=false` to zero the state, for example during the countdown or menus.

## Camera
`ChaseCamera(camera)`, `setMode(i)` and `nextMode()` (modes: chase, hood, bumper, cinematic), `update(dt, targetObject3D, physics)`.
- The chase and cinematic cameras use a damped spring.
- FOV widens with speed (up to +22°) and with nitro (+8°).
- Subtle sinusoidal shake starts above 180 km/h or with nitro. Turn it off with `shakeEnabled`.

## UI
- `HUD(root)`: call `setTrack(track)` once (it pre-renders the minimap from `track.spline` points), then `update(data)` every frame, with `show()`/`hide()`.
  - `data` = `{speed|speedKmh, rpm, maxRpm, gear, nitro, position, racers, lap, laps, time, lapTime, bestLap, countdown, wrongWay, mode, driftScore, driftCombo, drifting, heat, targetTime, targetScore, surviveLeft, message, player{x,z,heading}, others[{x,z}], police[{x,z}]}`
  - DOM writes only happen when a value changes.
- `Menus(root, {career, onStartEvent(event, carId), onSettingsChange(settings), onFreeRoam?})`:
  - Screens: `showMain()`, `showEventMap(ch)`, `showGarage()`, `showChallenges()`, `showSettings()`, `showDialogue(lines, cb, title?)`, `showResults(results, cb)`, `showPause(onResume, onQuit)`, `showLoading(text)`, `hide()`.
  - Starting an event plays the act intro (once) and the pre-event dialogue, then calls `onStartEvent`.
  - **`showResults` records the result in the career unless `results.reward` is already set.** Don't also call `completeEvent` yourself.
  - After the results screen, the post-event dialogue plays, plus the act outro after a boss win.
  - Settings carry `{preset, resolution, renderScale, renderer, traffic, pathTracing, volume, music, cameraShake, resolutionSize:[w,h]|null, trafficCount}` and are persisted in `career.settings`.
- `styles.css`: grounded street-racing theme (asphalt panels, warm white text, amber accent, red for warnings only). Every size comes from `--u = clamp(12px, 1.25vmin, 26px)`, so the layout scales smoothly from 720p to 1440p.

## Audio
`AudioSystem.init()` (call it on a user gesture), `update({rpm, throttle, speed, drifting, nitro})`, `playCollision(strength 0..1)`, `playBlip()`, `setVolume(v)`, `setMusicVolume(v)`.
- Everything is synthesized:
  - Engine: 2 detuned saws and a sub square through an rpm/throttle lowpass, plus band-passed noise rumble.
  - Effects: tire squeal (band-passed noise), nitro whoosh (high-passed noise), wind, and a collision thump (sine drop plus a noise burst).
  - Music: a 110 BPM synth loop (bass, arp and hats) scheduled ahead of time.
