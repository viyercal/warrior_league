# Boss combat arts

Every existing boss encounter now has signature abilities that make positioning or jumping part of the fight. These supplement existing melee attacks, radial volleys, mortars and equipped Crucible arts.

| Boss | Ability | Dodge response |
|---|---|---|
| Pit Warden | Cinder Lance; three Ashfall marks | Sidestep the aimed lane; leave the marked ground |
| Siege Colossus | Three parallel Siegebreaker lanes; Warfire Salvo | Move into lane gaps; leave the marked ground |
| Ashborn | Traveling Cinder Wave | Jump over the wave |
| Sera | Frost Spires at your last position | Walk or dash clear of the mark |
| Gorehowl | Traveling Fault Wave | Jump over the wave |
| Eternal | Alternating Cinder Wave and two Skyfall Hex marks | Jump the wave; move clear of the staggered strikes |

Warnings lock when the cast starts, show the full damage region, and announce the required response. Windups last 0.9-1.15 seconds, with additional travel or stagger time. Bosses commit to the cast and briefly recover, giving the player a chance to reposition and counterattack. Top-down casts have a six-second cooldown; Crucible signature casts have seven seconds. Existing shields, invulnerability, blocking and KO logic still apply.

The Colossus no longer advances attack timers during its entrance cinematic. Signature spells clear on death, results, round changes, respawn, wave jumps and scene teardown. The Pit's existing radial projectiles also expire when its boss dies or the match ends. Single Duel's adjustable CPU behavior is unchanged.

Verification covers automatic casts by all six bosses, warning geometry, locked targets, inside/outside damage, marked-area avoidance, swept wave collision, a real Space-key jump, standing still taking damage, pause, terminal-state cleanup, and responsive warning text. An early jump check caught excessive wave-tail collision padding; matching it more closely to the visible crest resolved the issue. Independent adversarial review found no remaining substantive issues, including after that correction.

Evidence is in `boss-arts-results.json` and `boss-arts-production-results.json`, and `boss-arts-public-results.json`, produced by `qa/probe-boss-arts.mjs`. The public Cloudflare deployment passed eight checks with no asset failures or browser errors. Desktop, tablet and mobile warning layouts were inspected; selected captures are in `docs/screenshots/boss-arts-*`. Automated checks establish functioning counterplay; human difficulty calibration remains a playtesting judgment.

**Executive summary:** Boss fights now require reading and dodging ranged, ground-targeted and traveling abilities as well as managing melee distance.
