# Racing, Mortal Arena and Phantom Twin updates

War Chariots now keeps full terrain footprints outside the road, provides collectible supplies, and runs faster CPU racers. Mortal Arena CPUs pursue elevated opponents, chain connected jabs, and recover earlier. The Forge has a Phantom Twin shortcut with a reduced duration and longer cooldown.

## Player controls and balance

- Drive through a supply chest, then press F or click the supply button. Fire Draught boosts speed, Hunter Bolt seeks the next unfinished racer, Ash Flask drops a trap, and Repair Kit clears damage. One item can be held at a time; chests respawn after five seconds. CPUs use the same pickups instead of receiving free periodic shots.
- Shift-click Phantom Twin, or focus it and press Shift+Enter, to equip all four slots. Each slot has its own 24-second cooldown. Twins last up to three seconds; the Crucible's lunge lasts 0.35 seconds. Recasting replaces the existing twin, so the shortcut does not create four concurrent allies. Other arts remain unique.
- Mortal Arena retains the existing CPU level choices and unchanged movement, health, damage and hitboxes. Its ally remains level 5 and uses jabs only.

## Verification coverage

| Area | Checks and evidence |
|---|---|
| Course | Full mesa and prop footprint clearance; rendered twelve chase-camera positions around the circuit ([contact sheet](screenshots/chariots-clear-course.jpg)). `kart-updates-results.json` |
| Race supplies | Actual drive-through collection; no overwrite; respawn; keyboard and click use; all four effects; CPU use; pause; finish; scene re-entry; desktop, tablet and mobile layout/overlap. `kart-updates-results.json`, `kart-race-results.json` |
| CPU racing | Five independent three-lap simulations improved from 84-86 seconds to 71-75 seconds, with no off-road excursions in the updated run. A full contested CPU race also completed with collisions, damage, items and finish flow. `kart-pace-results.json`, `kart-race-results.json` |
| Mortal Arena | Live pursuit and hit, connected three-hit combo, airborne facing, upper-platform double jump, three recovery launches, inward edge dodge, respawn targeting and one combo roll per attack. `brawl-updates-results.json` |
| Difficulty | Existing reaction/pressure/defense/recovery tier checks and fixed-stat invariants. `cpu-behavior-results.json` |
| Phantom shortcut | Normal selection, Shift-click, Shift+Enter, persisted reload, ordinary-art uniqueness, four-key badge at three viewport sizes, all seven modes, rapid Crucible replacement, independent cooldowns and effect expiry. `phantom-chorus-results.json` |

The production build passes. Vite retains its existing large shared-chunk warning. Racing times are observed simulations with randomized lane behavior, not human difficulty ratings.

Independent adversarial review found an airborne attack-facing regression and overlapping Crucible twin records. Both were fixed and rechecked with actual browser imports and functional gameplay tests. The repair icon and mobile item-button overlap were also corrected. The final targeted review reported no remaining findings.

**Executive summary:** Roads remain visible, racing opponents are faster, Mortal Arena opponents use more of their moves, and the Phantom Twin shortcut has limited uptime with longer per-slot cooldowns.
