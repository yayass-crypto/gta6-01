# Solmar Heat — an open-world crime game

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/yayass-crypto/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/yayass-crypto/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**Competition:** [gta6-01 — Make GTA 6](https://make.fun/bounty/gta6-01) · $1,666 prize pool, top 100 paid.

Danny Reyes owes fixer **Marisol Vega** a debt he cannot pay. One city, six jobs, and every cop in Solmar between him and freedom. Steal cars, outrun the law, take the turf — and make the big score.

## The city

**Solmar** is a fully procedural 3D open world (three.js, zero network requests at runtime): an 8×8 block grid with a downtown of neon towers, a beach strip and sea, a working port full of shipping containers, parks, a construction site with a crane, billboards with original fake ads, streetlights, and traffic lights that actually stop traffic.

## What you can do

- **On foot** — third-person Danny: WASD to move, Shift to sprint, mouse-drag to orbit the camera, Space to punch, click to shoot the pistol, R to reload.
- **Driving** — press E to enter any car, F to steal one (the owner runs, the cops notice). Arcade handling with handbrake drift (Space), car damage smoke, and headlights after dark.
- **Traffic & crowds** — 18 AI cars obey traffic lights and turn at intersections, 30 pedestrians stroll the sidewalks and flee gunfire.
- **Wanted system** — 0–5 stars. Steal, fight, and kill and the heat rises: police cruisers chase and ram, foot cops hunt you down, roadblocks appear at 3+ stars. Lay low at Vega's garage ($100) or stay hidden and the stars decay.
- **Combat** — fists and a pistol with ammo, plus health, armour, ammo and cash pickups scattered around town.
- **Six story missions** — steal a sedan for the chop shop, a hot delivery under a 2-star chase, a night bank job with a 3-star escape, a five-checkpoint street race, a turf war against eight Red Jackets, and a taxi fare run. Each has a briefing card, a waypoint beacon and arrow, timers, cash rewards, and an unlock chain. Finish all six for the Story Complete bonus.
- **HUD & minimap** — cash, health, armour, ammo, wanted stars, in-game clock, objective tracker with distance and timer, speedometer, a live circular minimap, damage vignette, and floating cash popups.
- **Sound** — fully synthesized WebAudio: engine hum that follows your speed, two-tone sirens, gunshots, punch thuds, pickup chimes, mission jingles. N mutes.
- **Save** — progress autosaves to localStorage (cash, jobs done, health, ammo); Continue picks up where you left off.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse drag | Orbit camera |
| Click | Shoot pistol |
| Space | Punch (on foot) / handbrake (driving) |
| E | Enter / exit car |
| F | Steal nearby car |
| R | Reload |
| Shift | Sprint |
| M | Next job briefing |
| N | Mute |
| Esc | Pause |

## Tech

Built with three.js (vendored locally under `game/vendor/`), plain ES modules, canvas-generated building textures and billboards — no external assets, no fonts, no network requests while playing. Runs offline from `game/index.html`.

Serve locally with `node serve.ts` and open http://localhost:8080.

## License

MIT — see `LICENSE`. All names, characters, places, vehicles, story and art are original; nothing here is affiliated with or derived from any Rockstar game.
