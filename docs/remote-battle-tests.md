# Remote battle tests

The `Remote battle tests` GitHub Actions workflow builds and serves the committed production game on GitHub-hosted Ubuntu runners. Chromium runs on those runners, never in the user's local browser. Each job has a fresh browser context and a 20-minute limit; gameplay itself has a 10-minute limit.

The three agent-authored controllers use normal mouse and keyboard inputs. Read-only game telemetry helps them aim, steer, and record observations. They do not inject health, currency, positions, cooldowns, or waves. These are adaptive scripted play sessions reviewed by agents, not live language-model control on every frame.

| Session | Intended coverage |
| --- | --- |
| Field | War Rift, The Pit, Last Bastion; click movement, aiming, abilities, building, help, pause, restart, hub return |
| Fighters | Tower and single duels, platform brawler; walking, jumping, fighting, abilities, controls, pause, natural results |
| Sports | Settings, Forge, Phantom shortcut, Blood Court, War Chariots; shooting, steering, items, abilities, pause, restart, hub return |

Each job uploads screenshots, state snapshots, `report.json`, `events.jsonl`, and a Playwright trace. Artifacts expire after seven days. A failed check or recorded error marks the job failed. Review evidence before treating a failure as a game defect: a controller can misread UI, encounter a transient state, or fail to reach content within its time budget.

Software WebGL on CI is not a representative performance or difficulty benchmark. Use elapsed simulation time when assessing progress. Naturally unreached bosses, later waves, finishes, and result flows remain untested; a completed job does not establish exhaustive game coverage.

The workflow starts when its scripts or workflow change on `feat/astra-immersive-realms`, and supports manual dispatch. The browser launcher rejects ordinary local execution.

## First run

- Tested commit: `d16bbcc2402eaee175f23e822ecbe92333da3d1a`.
- Run: https://github.com/viyercal/warrior_league/actions/runs/38102697209
- Focus: crashes, stuck states, broken controls, unreadable UI, and dead-end flows. Difficulty calibration is excluded.
- Results: runner-limited. Field sessions advanced only 1.2 to 1.6 simulation seconds before screenshot timeouts. Two pause-freeze checks passed, but no field combat, tower construction, or bosses were reached. Fighter sessions remained in pre-fight/countdown at approximately 0.5 to 1.3 FPS. These are not confirmed gameplay defects.

## Corrected follow-up

- Tested commit: `317b7001e40189eeb33c6114af5d13179a22e56f`.
- Run: https://github.com/viyercal/warrior_league/actions/runs/38103202172
- Status at handoff: launched; results pending.
- Render DPR reduced to 0.35 (448x252 3D rendering, unchanged 1280x720 UI). This can assess mechanics but does not certify normal-resolution visual quality.
- Screenshot failures are explicit coverage gaps and no longer interrupt gameplay. Trace image capture is disabled to reduce compositor load; individual PNG captures remain enabled.
- Transition checks wait for actual readiness. Shot attempts use game counters; item-use coverage confirms inventory consumption.
- Independent review verified these harness changes. No game runtime code changed for either run.

## Verified findings and fixes

Independent screenshot and source review found two concrete Duel UX defects in the first run:

1. Skipping the intro set its timeline to 99, which extrapolated an unclamped camera transition far outside the arena. Cinematic sampling now clamps to its authored 3.4-second endpoint.
2. The Single Duel CPU badge expanded the Pause button into Controls. The badge now sits above Pause without increasing its width.

Fix commit: `29d11fbde4820286e3c0bbd8128bfdb8d9f917df`. Independent code review, syntax checks, the production build, and focused tests invoking the production cinematic method passed. Full remote browser verification is pending at handoff.

Remote verification run: https://github.com/viyercal/warrior_league/actions/runs/38103362695

The new fighter checks observe camera bounds after actual intro skipping and test Pause/Controls rectangles at 1280, 900, and 390 CSS pixels. The runner also omits the Forge's nonnumeric `stage` object from telemetry, resolving a circular-JSON logging failure discovered in the first sports run.

Initial sports evidence verified sensitivity increase/reset and the four-slot Phantom shortcut. It did not reach live basketball or racing. No difficulty values were changed.
