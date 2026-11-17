# SOLMAR HEAT — an open-world crime game

![gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/yayass-crypto/gta6-01/rank.svg)
![reward](https://make.fun/badge/gta6-01/yayass-crypto/gta6-01/reward.svg)

Built for the [make.fun gta6-01 "Make GTA 6" bounty](https://make.fun/bounty/gta6-01) — an original open-world crime game set in the fictional coastal city of **Solmar**. All names, characters, vehicles, story, art and sound are original. Nothing here is from Rockstar or GTA.

## The story

Danny Reyes owes fixer **Marisol Vega** a debt. Three jobs stand between him and a clean slate:

1. **First Wheels** — steal the marked yellow sedan by the pier and deliver it to the chop shop.
2. **Hot Delivery** — pick up a package at the port and run it downtown under a 2-star wanted level.
3. **The Big Score** — a night job at the Solmar National Bank: grab the cash, shake a 3-star police chase, and reach the hideout. Finish all three for a $1,000 story bonus.

## What is in the game

- **Procedural city** — an 8×8-block grid with roads, sidewalks, parks, a beach strip, a port district and a downtown of towers. Buildings use canvas-generated procedural textures; billboards carry original fake ads (Solmar Cola, Taco Rey, Palm Motel…).
- **On foot** — third-person low-poly Danny, WASD + mouse-drag orbit camera, Shift to run, Space to punch, F / click to shoot the pistol (hitscan tracers, muzzle flash), R to reload.
- **Driving** — arcade car physics with acceleration, braking, steering, handbrake drift and chase camera. Press E to enter or exit any car — including stealing parked traffic cars (the driver flees, the law notices).
- **Traffic & pedestrians** — 14 AI cars following road lanes and stopping at traffic lights, 24 pedestrians on the sidewalks who flee gunfire and crashes.
- **Wanted system** — 0–5 stars. Stealing, assault and killing raise the heat; police cars chase and ram, foot cops chase and brawl. Lay low and the stars cool off.
- **Combat & pickups** — fists + pistol, gang members in the final mission, health / armour / ammo pickups, slow health regen, car damage smoke.
- **HUD & minimap** — cash, health, armour, ammo, wanted stars, in-game clock, mission objective, speedometer, damage vignette, floating cash popups, and a live 2D minimap (roads, player arrow, traffic, cops, mission blip, north).
- **Title, pause, busted / wasted and story-complete screens**; progress autosaves to localStorage after every mission.
- **Sound** — 100% WebAudio synth: engine hum, sirens, gunshots, punch thuds, pickup chimes, mission jingles, ambient pad. M mutes. No audio files, no network requests — the game runs fully offline (three.js is vendored locally).

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse drag | Orbit camera |
| Shift | Run |
| E | Enter / exit car (steal a parked car) |
| F or Click | Shoot pistol |
| Space | Punch (on foot) / handbrake (driving) |
| R | Reload |
| Esc | Pause |
| M | Mute |

## Run it

```bash
node serve.ts   # then open http://localhost:8080
```

Or open `game/index.html` directly in a browser (ES modules + local three.js, no build step).

## Tech

- three.js r160 (vendored under `game/vendor/`), plain ES modules, no build tools.
- `game/src/main.js` — boot, loop, state machine, camera, input.
- `game/src/city.js` — procedural city, textures, collision.
- `game/src/vehicles.js` — player car physics, traffic AI, police chase AI.
- `game/src/people.js` — on-foot player, pedestrians, foot cops.
- `game/src/missions.js` — the 3-mission story state machine.
- `game/src/combat.js` — shooting, melee, damage, pickups.
- `game/src/hud.js` — HUD DOM + minimap canvas.
- `game/src/audio.js` — WebAudio synth SFX.
- `game/src/save.js` — localStorage save/load.
- `game/src/shots.js` — `?shot=start|drive|chase|mission` screenshot staging.

## License

MIT — see [LICENSE](LICENSE).
