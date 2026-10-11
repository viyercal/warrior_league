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
- Final status: field passed 22 checks; sports and fighters failed. The failures were the Forge logger, Court wall-clock meter wait, and a Duel movement assertion with insufficient simulation time. See the triage below.
- Render DPR reduced to 0.35 (448x252 3D rendering, unchanged 1280x720 UI). This can assess mechanics but does not certify normal-resolution visual quality.
- Screenshot failures are explicit coverage gaps and no longer interrupt gameplay. Trace image capture is disabled to reduce compositor load; individual PNG captures remain enabled.
- Transition checks wait for actual readiness. Shot attempts use game counters; item-use coverage confirms inventory consumption.
- Independent review verified these harness changes. No game runtime code changed for either run.

## Verified findings and fixes

Independent screenshot and source review found two concrete Duel UX defects in the first run:

1. Skipping the intro set its timeline to 99, which extrapolated an unclamped camera transition far outside the arena. Cinematic sampling now clamps to its authored 3.4-second endpoint.
2. The Single Duel CPU badge expanded the Pause button into Controls. The badge now sits above Pause without increasing its width.

Fix commit: `29d11fbde4820286e3c0bbd8128bfdb8d9f917df`. Independent code review, syntax checks, the production build, and focused tests invoking the production cinematic method passed. Run 38103362695 verified the camera bounds and Pause/Controls separation at 1280, 900, and 390 CSS pixels. Its desktop controls screenshot also shows the arena and fighters correctly; missing screenshots limit wider visual verification.

Remote verification run: https://github.com/viyercal/warrior_league/actions/runs/38103362695

The new fighter checks observe camera bounds after actual intro skipping and test Pause/Controls rectangles at 1280, 900, and 390 CSS pixels. The runner also omits the Forge's nonnumeric `stage` object from telemetry, resolving a circular-JSON logging failure discovered in the first sports run.

Initial sports evidence verified sensitivity increase/reset and the four-slot Phantom shortcut. It did not reach live basketball or racing. No difficulty values were changed.

## Failed-run triage

The three annotations on each failed job in run `38103202172` were one process-exit failure, one Node.js action deprecation warning, and one Ubuntu image migration notice. They were not three gameplay failures.

- Field passed 22 checks and achieved 8.6 to 12.1 simulation seconds per realm: actual movement/combat, three War Rift minion kills, seven Pit kills, five Siege kills, and one tower build. Bosses, repairs, upgrades, and match endings were not reached.
- Sports reached 55% of a race lap, confirmed two item consumptions, and exercised restart/hub return. Court stopped on a 6.5-second wall-clock wait while rendering below two FPS. The newer run fixed Forge logging and verified Skyfall did not award points on cast.
- The failed Single Duel walking assertion observed only 0.15 simulation seconds. Its replacement requires an accepted mouse order and actual directional walking during actionable simulation time; combat interruptions cannot count as successful walking.
- A later Brawl startup assertion reported a stale timeout even though its captured state was already `fight`. Startup now rechecks after both the deadline and screenshot capture.
- The later Pit restart click timed out while delivering the input, but the captured scene proves restart succeeded. That transition click now has a 20-second bound and retains scene-identity verification.

The meter test still fails if sufficient scaled gameplay time passes without registration/progress. Low-progress or interrupted observations remain explicit coverage gaps. GitHub job summaries now separate passed checks, errors, and coverage gaps. These harness changes were independently reviewed.

Corrected verification: commit `17a5e8bb462cf7a139e75dda64ae23ae61522f51`, run https://github.com/viyercal/warrior_league/actions/runs/38103954571.

- Fighters passed all 33 checks, including accepted mouse orders and confirmed directional walking in both Duel modes, camera bounds, responsive control separation, and Brawl combat.
- Sports completed with no runtime errors. Two original assertions still failed: Court advanced 4.89 rather than 8 simulation seconds, and one advancing CPU reached 26% rather than 30% of a lap. Actual play registered two shots, one three-pointer, and forward progress for every racer.
- Those two pace assertions were subsequently replaced by monotonic-time and observed movement/stall checks. [Offline replay](sports-acceptance-replay.json) of the same recorded real-input observations passes the revised checks. Synthetic stationary negative controls fail, while legal reverse movement without net forward progress is explicitly unverified. This does not change the original CI job's failed status, and is not a new browser run.
- The Field job had not reported any steps at this review checkpoint. The earlier 22-check Field pass remains the applicable completed evidence. The longer restart-click bound has not received a completed fresh remote Field check.

The assertion-only sports revision changes neither game code nor browser actions. Full matches, later bosses, and normal-resolution visual quality remain unverified.

### Deferred minor finding

Siege's opening WAVE 1 announcement overlaps its PREPARE countdown in the remote build-affordance screenshot. This is a transient readability defect, not a confirmed gameplay blocker. Keep it in the UI follow-up queue. Difficulty settings and game rules were not changed during this triage.

Compact check results and failure evidence are retained in [remote-battle-results.json](remote-battle-results.json).

## Focused item-button retest

Run [38111312236](https://github.com/viyercal/warrior_league/actions/runs/38111312236) passed on commit `b179974e01f2e2afa93263f0936dabe86c845fee`. It drove naturally to supplies and used ordinary, unforced locator clicks. Both calls completed without errors or coordinate fallback:

- Fire Draught: trusted click consumed the held item and set boost duration to 2.2 and boost power to 12. Click delivery took 1.93 seconds at an observed 1.45 FPS.
- Hunter Bolt: trusted click consumed the held item and created a player-owned homing projectile at speed 40. Click delivery took 2.02 seconds at an observed 1.25 FPS.

The failed broad run had allowed only 2.5 seconds while rendering at 0.73 FPS. The focused test allowed 25 seconds and released held driving keys before the click. The broad sports journey now uses that same tested sequence. No game runtime code changed. This verifies the two item interactions, not full race completion.

All four screenshot attempts timed out on the software renderer. The functional result is supported by the browser trace, trusted capture/bubble event records, and observed inventory/effect transitions; it does not establish additional visual QA. Compact evidence is saved in [kart-item-retest-results.json](kart-item-retest-results.json).
