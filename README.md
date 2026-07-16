# Arcade Games — Immersive Playable League

A browser meta-game: forge **one hero** — your colors, your look, your four abilities — then drop them into full game clones through a Wii-style channel hub. Your hero, your skills, every game.

Built with Three.js. **Every asset is procedural** — no models, textures, fonts, or audio files. Toon + rim-light shaders, HDR bloom, dynamic shadows, procedural VFX, and a WebAudio synth soundtrack, all generated at runtime.

## The games

| Channel | Clone of | What your skills become |
|---|---|---|
| **Rift Legends** | League of Legends | Skillshots, blinks, meteors — lane vs an AI champion with minions, towers, gold & levels |
| **Slam City 2K** | NBA 2K / NBA Jam | Ankle-breaker warps, titan dunks, comet alley-oops in a 1v1 half-court showdown |
| **Nova Arena** | Horde brawler | Full power fantasy vs 8 waves and a boss on a neon disc in space |

The same 12-skill catalog (Blink Step, Comet Crash, Gravity Well, Titan Form, Phase Cloak…) is reinterpreted per game — the Hero Forge tooltips tell you what each skill does in each world before you enter.

## Screenshots

| | |
|---|---|
| ![Hub](docs/screenshots/hub.png) | ![Hero Forge](docs/screenshots/loadout.png) |
| ![Rift Legends](docs/screenshots/moba.png) | ![Slam City 2K](docs/screenshots/hoops.png) |

![Nova Arena](docs/screenshots/arena.png)

## Run it

```bash
npm install
npm run dev        # → http://localhost:5173
```

Jump straight into a scene: `http://localhost:5173/?scene=moba|hoops|arena|hub|loadout` (`&mute=1` for silence).

## Controls

- **Hub** — hover/click a channel, ←/→ + Enter, C to customize
- **Rift Legends** — right-click move/attack, QWER skills, B recall, Y camera lock, wheel zoom
- **Slam City 2K** — WASD move, Shift sprint, hold/release Space to shoot (time the meter!), F steal, double-tap A/D crossover, 1-4 skills
- **Nova Arena** — WASD move, aim with mouse, hold LMB blaster, 1-4 skills
- **Esc** returns to the hub from anywhere; H toggles help in games

## Architecture

- `src/core/` — engine (renderer, post chain, loop), input hub, scene router, procedural audio
- `src/art/` — toon/rim/plasma/water materials, environment kit (skies, crystals, trees), character factory, VFX pool
- `src/meta/` — hub, hero forge, the universal 12-skill catalog
- `src/games/` — one folder per game, each a self-contained scene module
- `qa/` — Playwright screenshot + real-input probes used to verify every flow

`CONTRACTS.md` documents the scene-module contract and shared API.
