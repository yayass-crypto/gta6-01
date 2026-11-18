# Solmar Heat — an open-world crime game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/yayass-crypto/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/yayass-crypto/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the make.fun bounty
[Make GTA 6](https://make.fun/bounty/gta6-01): one procedural city, a
third-person outlaw, drivable cars, traffic, pedestrians, a wanted system
with police chases, three story missions, combat, a HUD with a minimap, a
start screen and a save — all running offline in a desktop browser from
static files, with no network requests and no Rockstar material anywhere.

## The story

Danny Reyes owes fixer Marisol Vega a debt he cannot pay. Three jobs stand
between him and a clean slate:

1. **First Wheels** — steal the marked sedan by the marina and deliver it to the chop shop before the clock runs out.
2. **Hot Delivery** — run a package across town while the cops are already on you at 2 stars.
3. **The Big Score** — a night job at the downtown bank: grab the cash, survive the armed crew, and lose a 3-star chase at the hideout.

Finish all three and the story is complete. Free roam stays open after that.

## What is in the city

- **Solmar**, a procedural 8×8-block city: downtown towers, a beach strip with palms, a port full of containers, parks, billboards with original fake ads, and street lamps that light the night job.
- **On foot**: third-person movement, mouse-drag camera, run, punch, and a pistol with hitscan tracers and a muzzle flash.
- **Driving**: arcade car physics with handbrake drift, car damage and smoke, and the ability to enter, exit and steal any traffic car.
- **Traffic and pedestrians**: ~14 cars driving the road grid and obeying traffic lights, ~24 walkers on the sidewalks who flee gunfire and crashes.
- **Wanted and police**: 0–5 stars. Stealing, assault and killing raise the heat; police cars chase and ram, cops on foot brawl you into a bust. Lay low at the hideout for $200 to clear the heat.
- **Combat and pickups**: fists, a pistol with reloads, gang shooters in the final job, and health, armour and ammo pickups around the city.
- **HUD and minimap**: cash, health, armour, ammo, wanted stars, the game clock, the current objective, speed while driving, and a live minimap with roads, traffic, police and the mission blip.
- **Start and save**: title screen with New Game / Continue, pause, busted and wasted screens, and a localStorage save that keeps cash and jobs done.
- **Sound**: everything is synthesised with WebAudio — engine hum, sirens, gunshots, punches, pickup chimes, mission jingles and an ambient city loop. M mutes.

## Controls

WASD move · mouse drag to look · wheel zoom · Shift run · E enter / exit car · F steal car · click shoot · Space punch · R reload · 1 / 2 / 3 start the next job · Esc pause · M mute

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Or build the hand-in directly:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the kit's vendored `vendor/makefun-game.ts`. The game itself needs no server and no network: three.js is vendored under `game/vendor/`.

## License

MIT — see [LICENSE](LICENSE).
