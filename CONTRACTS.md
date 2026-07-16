# IWL — Immortal Warlords League: Module Contracts

Read this fully before writing any code. The shared core/art layer is FROZEN —
do not modify any file outside the ones you own.

## Warrior theme (READ FIRST — overrides all older neon references below)

This fork is the "IMMORTAL WARLORDS LEAGUE" (IWL) retheme. The game must feel
like a gritty, grounded dark-fantasy warrior epic — a Mortal-Kombat-adjacent
tournament atmosphere: torchlight, stone, iron, bronze, leather, bone, embers,
war banners. NOT neon, NOT sci-fi, NO cyan/magenta.

**Palette** (use these hexes, or close relatives): charcoal stone `#2a2621`,
iron `#6b6f78`, aged bronze `#b0793a`, blood crimson `#a1252c` (accents
`#c23b2e`), ember orange `#ff8c3b`, forge fire `#ff5a26`, torch gold `#ffb84d`,
bone `#e8dcc4`, dark leather `#4a352a`, night skies in deep umber/indigo
(`#1a1420` to `#3a2030` horizons). Glow/bloom still exists but must read as
FIRELIGHT and rune-embers, not neon.

**Tone guardrails**: stylized and gritty — sparks, embers, dust, crimson
energy; NO gore, dismemberment, or blood pools. Announcer-style banners like
"FIGHT!", "FLAWLESS!", "END THEM!" are great; do NOT use trademarked phrases
("FATALITY", "MORTAL KOMBAT", "FINISH HIM").

**Rebrand — DISPLAY TEXT ONLY.** Scene keys, routes, profile ids, stats keys
ALL STAY THE SAME. Only the strings shown to the player change:

| scene key | old title | new title | new subtitle |
|-----------|-----------|-----------|--------------|
| (app)     | IPL / IMMERSIVE PLAYABLE LEAGUE | IWL / IMMORTAL WARLORDS LEAGUE | FORGE YOUR LEGEND |
| moba      | RIFT LEGENDS   | WAR RIFT     | 1V1 LANE WARFARE |
| hoops     | SLAM CITY 2K   | BLOOD COURT  | GLADIATOR B-BALL |
| arena     | NOVA ARENA     | THE PIT      | HORDE SURVIVAL |
| kart      | TURBO KART GP  | WAR CHARIOTS | 3-LAP DEATH RACE |
| brawl     | BRAWL STADIUM  | MORTAL ARENA | LAST WARRIOR STANDING |
| siege     | SIEGE PROTOCOL | LAST BASTION | HOLD THE GATE |

The shared core already ships the warrior look: the Hero is an armored warlord
(bronze/iron plate, leather, ragged cloak, ember rune accents), `styles.css`
is a stone/bronze/parchment design system, and the 12 skills in
`src/meta/skills.js` are re-flavored to warrior fantasy (same ids/archetypes/
params — only names/icons/colors/descriptions changed). Match your scene's
environments, VFX tints, and copy to this direction.

## Vision & quality bar

A meta-game: the player builds ONE hero (appearance + 4-skill loadout) and drops
into clones of famous games via a Wii-style channel hub. The graphics bar is
"League of Legends / Overwatch in the browser": stylized-painterly, saturated
complementary palettes, strong silhouettes, rim light everywhere, emissive
accents feeding HDR bloom, gradient skies, depth fog, and MOTION EVERYWHERE —
nothing in frame should be perfectly still. Every player action needs layered
feedback: VFX + SFX + (when impactful) screen shake + floating text.

Performance: 60fps on an integrated-GPU Mac. Prefer shared geometries/materials
for repeated props, ONE shadow-casting directional light per scene (mapSize ≤ 2048,
tight shadow camera bounds), pixelRatio is already capped at 2. Avoid per-frame
allocations in hot loops (reuse Vector3s).

## Run / test

- `npm run dev -- --port <YOUR_PORT> --strictPort` (each agent uses its OWN port, see task).
- Open `http://localhost:<port>/?scene=<name>&mute=1` — jumps straight into your
  scene, skips the click gate. Scene names: `hub`, `loadout`, `moba`, `hoops`, `arena`,
  `kart`, `brawl`, `siege`.
- `window.__ipl = { engine, input, audio, sm }` and `window.__scene` (current module)
  are exposed for debugging/QA.
- Screenshot QA: use playwright-core with `channel: 'chrome'` (installed; Chrome is
  present). Wait ~3s after load for the scene to settle before capturing.

## Scene module contract

Every scene file default-exports a class:

```js
export default class MyScene {
  constructor(ctx) { this.ctx = ctx }
  async init() { /* build this.scene (THREE.Scene) and this.camera */ }
  update(dt, t) { /* dt clamped ≤ 0.05s; t = elapsed seconds */ }
  resize(w, h) { /* optional; perspective camera aspect is auto-updated */ }
  dispose() { /* stop timers/emitters; scene GPU teardown is automatic */ }
  // optional: postOpts = { bloom, bloomThreshold, bloomRadius, vignette, grain, saturation,
  //                        ssao, ssaoIntensity, exposure } (see "Realism kit")
  // optional: debug = { win: () => {}, lose: () => {} } — force end states for QA
}
```

`ctx` = `{ engine, input, audio, profile, saveProfile(), goTo(name, params), params }`

- `engine`: `.renderer`, `.envMap` (PMREM texture for `scene.environment`),
  `.shake(amp, dur)`, `.onResize(fn)`. Do NOT call engine.setScene yourself.
- `input`: `.isDown(code)`, `.buttonDown(b)`, `.mouse` (NDC Vector2), `.mousePx`,
  `.onKey(fn(code, isDown, e))`, `.onMouse(fn(button, isDown, e))`, `.onWheel(fn(dy, e))`,
  `.pick(camera, objects)`, `.groundPoint(camera, y, out)` → Vector3 | null.
  Handlers are auto-cleared on scene change — never add raw window listeners for
  gameplay (if you must, remove them in dispose()).
- `audio`: `.play(name, {delay, vol})` — names: click hover back cast dash zap hit
  explode heal shield coin levelup kill tower bounce swish rim buzzer whistle crowd
  countdown go victory defeat spawn. `.music(theme)` — themes: hub battle court arena
  race brawl siege.
  Call `.music(...)` once in init(); SceneManager stops music on scene change.
- `profile`: `{ name, appearance: {primary, secondary, glow, head, hair, trail, cape},
  loadout: [4 skill ids], stats: {wins: {}, plays: {}} }`. Mutate then call
  `saveProfile()`. Record results: `profile.stats.wins[game] = (…|0) + 1`.
- `goTo(name, params)`: e.g. `goTo('loadout', { game: 'moba' })`,
  `goTo('hub')`. Escape → hub is already global.

HUD DOM goes in `#ui` (auto-cleared between scenes). Use `HUD` from `src/ui/hud.js`.
Panels are click-through unless you add class `ui-interactive`.
Per-scene CSS: create your own file (e.g. `src/ui/moba.css`), `import './../../ui/moba.css'`
from your scene, and PREFIX every class (`.moba-…`) to avoid collisions.

## Shared library cheat sheet (import paths relative to repo root)

`src/core/utils.js` — TAU, clamp, lerp, damp(a,b,lambda,dt), rand(a,b), randInt,
pick, angleLerp, v3(), distXZ(a,b), disposeObject3D(root)

`src/core/assets.js` — canvasTexture(w,h,draw), gradientTexture(stops,opts),
toonRamp(steps), glowTexture(), starTexture(), cloudTexture(),
groundTexture({base, blotches, size, count, alpha}), makeEnvMap(renderer)

`src/art/materials.js` —
- toonMaterial({color, steps, rim, rimStrength, rimPower, emissive, emissiveIntensity, map, transparent, opacity, flatShading, side}) — THE character/prop material
- glowMaterial(color, intensity) — HDR unlit, blooms
- glowSpriteMaterial(color, opacity) — additive halo sprite material
- energyMaterial({color1, color2, speed, intensity}) — animated plasma (auto-ticked)
- waterMaterial({shallow, deep, opacity, speed}) — animated water (auto-ticked)

`src/art/environment.js` — skyDome({top,mid,bottom,radius,sunDir,sunColor,sunSize}),
starField(opts), cloudLayer(opts) → group with .tick(dt), groundDisc({radius,repeat,texOpts}),
crystal({color1,color2,height}) → group with .tick(dt), tree(opts), rock(opts),
lightShaft(opts), fireflies(opts) → points with .tick(dt).
Anything with `.tick(dt)` — YOU call it in update().

`src/art/characterFactory.js` —
- `createHero(profile.appearance, {auraRing})` → Hero: `.group` (origin at feet, ≈2 units
  tall), `.update(dt)` (call every frame), `.setMoveSpeed(unitsPerSec)` (drives run anim),
  `.setState('normal'|'dance'|'ko')`, `.cast()` (arm-raise anim), `.faceTowards(vec3, dt, rate)`,
  `.castPoint(out)` (world pos of casting hand), `.ring` (ground aura mesh, toggle .visible).
- `createMinion({color, evil, scale})` → Minion: `.group`, `.update(dt)`, `.setMoving(bool)`,
  `.hitFlash()`. Evil minions get an angry red visor; friendly get cute eyes.

`src/art/vfx.js` — `new VFX(scene)`, call `.update(dt)` every frame, `.dispose()` in dispose().
burst(pos,opts), ring(pos,{radius,color,…}), flash(pos,opts), beam(a,b,opts),
lightning(a,b,opts), projectile({from, dir|to, speed, color, size, life, gravity, trail, light})
→ handle {pos, vel, alive, kill()} (VISUAL ONLY — your game code polls handle.pos for hits,
then calls handle.kill() + vfx.impact), trail(object3d, opts) → {stop()},
text(pos, str, {color,size}) — damage numbers/announcements, impact(pos,opts),
shockwave(pos,{color,radius}).

## Realism kit (REALISM PASS — read before styling any game scene)

Game scenes must read as REALISTIC-STYLIZED (God of War / Elden Ring screenshot
energy at low-poly scale), not toon-arcade. The warrior THEME is unchanged —
only rendering fidelity. Direction essentials for every game scene:

- **Materials**: MeshStandardMaterial/Physical everywhere. Desaturated natural
  albedos, per-material roughness/metalness (worn iron ≈ rough 0.55 / metal 0.9;
  leather 0.9; stone 0.95; polished bronze 0.35 / metal 1.0). Use the presets
  below — they share cached texture sets. `scene.environment = engine.envMap`.
  NO toon ramps, NO rim light (≤0.08 if you must), NO `glowMaterial` neon —
  the only emissives are real fire/embers via `fireMaterial`/`emberGlowMaterial`.
- **Lighting**: ONE physically plausible key (sun/moon/torch glow), warm-vs-cool
  balance, torch point lights with `decay = 2`, hemisphere fill at LOW intensity,
  PCFSoft shadows with tuned bias, mapSize ≤ 2048. Let blacks be black.
- **Grounding**: `contactShadow()` blobs under characters/props (Hero/Minion
  already ship one), darkened vertex/texture gradients at object bases,
  `dirtOverlay(..., { edge })` corner darkening in ground textures.
- **Imperfection**: nothing perfectly clean — dirt overlays, edge wear, plank
  gaps, cracked stone, scratches. Bevel silhouette edges that matter; jitter
  organic shapes; instance cheap ground clutter (pebbles, splinters, shards).
- **Atmosphere/post**: per-scene fog + aerial desaturation with distance;
  RAISE `bloomThreshold` (≈0.9+) so only true fire/embers bloom; pull
  `saturation` toward 1.0; realistic sky gradients, horizon haze, dim stars.
- **Perf budget is law**: 60fps on an integrated-GPU Mac at the busiest scene
  (siege, 45 raiders). Share materials/geometries, instanced clutter, no
  per-frame allocations, one shadow-casting light.

`src/core/assets.js` additions (all tileable, RepeatWrapping):
- `noiseTexture({size, octaves, scale, scaleY, seed, lo, hi, srgb})` — multi-octave
  value noise; `fbmNoise(u, v, opts)` / `noiseField(size, opts)` for raw fields.
- `normalMapFromHeight(src, {strength, size})` — tangent-space normal map from a
  Float32Array field, a canvas, or a draw fn.
- `roughnessTexture({size, base, variation, octaves, scale, seed})` — linear map;
  effective roughness = material.roughness × map sample.
- `dirtOverlay(baseTex, {amount, edge, speckle, color, seed})` — composites grime,
  edge/corner AO and flecks onto an existing canvas texture (mutates + returns).
- Texture SETS, each `{ map, normalMap, roughnessMap }` at 512px:
  `crackedStoneTexture()`, `woodPlankTexture()`, `packedEarthTexture()`,
  `wornMetalTexture()` (NEUTRAL bright-grey albedo — tint via material.color),
  `fabricGrainTexture()` (fine neutral grain for leather/cloth/bone).

`src/art/materials.js` additions (existing toon/glow exports untouched — they
remain for hub/loadout only):
- `pbrMaterial({color, roughness, metalness, maps, normalScale, envMapIntensity,
  emissive, emissiveIntensity, transparent, opacity, side, flatShading})`
- Presets (optional albedo tint arg; texture sets cached + shared): `stoneMaterial()`,
  `ironMaterial()`, `bronzeMaterial()`, `leatherMaterial()`, `woodMaterial()`,
  `earthMaterial()`, `boneMaterial()`, `clothMaterial(color)` (DoubleSide).
- `fireMaterial({intensity, speed, edgeColor, midColor, coreColor})` — animated
  blackbody flame (auto-ticked); apply to cones/planes with v=0 at flame base.
- `emberGlowMaterial(intensity = 1.5, color = '#ff8c3b')` — THE emissive accent
  (rune slits, eyes, embers). Keep intensity ≤ ~2 so it reads as ember, not LED.
- `contactShadow(radius, opacity)` — soft dark blob mesh, pre-rotated flat at
  y = 0.02; add to a character/prop group to ground it.

`src/core/post.js` — `buildComposer` extra opts (defaults = old behavior):
- `ssao: false` — inserts a cheap SAOPass (kernel 16, blurred) between render and
  bloom; `ssaoIntensity` (default 0.05). BENCHMARK YOUR SCENE before shipping it.
- `exposure: 1` — pre-tonemap exposure multiplier in the grade pass.

`src/core/engine.js` — `engine.setExposure(v)` sets renderer.toneMappingExposure
(applies live through the composer's OutputPass).

`src/art/characterFactory.js` — Hero/Minion now render with the PBR kit (worn
bronze/iron, grained leather, ragged cloth, ember accents, built-in contact
shadow blob `.shadowBlob`). API, rig, proportions, animations, appearance ids and
`mats.*` keys (incl. `mats.primary`/`mats.secondary` aliases) are UNCHANGED —
profile colors still tint `mats.bronze`/`mats.leather` albedo exactly.

`src/meta/skills.js` — SKILLS (12 defs), getSkill(id), KEY_LABELS, KEY_CODES,
WASD_KEY_LABELS, wasdKeyIndex(code).
Each: {id, name, icon, color, cd, archetype, params, desc,
inGame:{moba,hoops,arena,kart,brawl,siege}}.
Archetypes: dash, projectile, slowfield, nova, buff, shield, heal, summon, pull,
giant, ghost, meteor.
KEY RULE: games where W means "move/accelerate" (hoops, arena, kart, siege) bind
skills via wasdKeyIndex (1-4 primary, Q/E/R aliases) and pass
`keys: WASD_KEY_LABELS` to abilityBar. Games without a W conflict (moba, brawl)
use classic KEY_CODES Q/W/E/R.

`src/ui/hud.js` — `new HUD()`: el/panel, abilityBar(skills, {game}) →
{root, setCooldown(i, frac, secs), flash(i), setActive(i,on)}, bar({label,color}) →
{root, set(frac, text)} (position via returned .root.style), banner(text,{sub,color,duration})
(duration 0 = persistent), toast(msg), hints([[key,action],…]), countdown(audio) → Promise.

## Skill implementation rules (games)

Read `profile.loadout`, map to defs via getSkill, wire Q/W/E/R via KEY_CODES.
EVERY archetype must do something sensible in EVERY game — the loadout screen
promises what each does (see `inGame` text — implement THAT). Track cooldowns,
feed `abilityBar.setCooldown(i, remaining/cd, remaining)` each frame, call
`.flash(i)` + `hero.cast()` + `audio.play('cast')` + a VFX on every cast.

## Three.js conventions

three r166. Import addons from `three/addons/...`. No external assets, CDNs, fonts,
or network fetches — everything procedural. Renderer already uses ACES tone mapping +
sRGB; the composer adds bloom (threshold ≈0.82) — emissive/HDR colors > 1 will glow.
Shadows: PCFSoft enabled globally; set castShadow/receiveShadow per mesh.
Scene fog + matching sky colors = depth. `scene.environment = ctx.engine.envMap`
for PBR sparkle on standard materials.

## File ownership

- Hub agent: `src/meta/hubScene.js` (+ optional `src/meta/hub*.js` helpers, `src/ui/hub.css`)
- Loadout agent: `src/meta/loadoutScene.js` (+ optional helpers, `src/ui/loadout.css`)
- MOBA agent: `src/games/moba/**` + `src/ui/moba.css`
- Hoops agent: `src/games/hoops/**` + `src/ui/hoops.css`
- Arena agent: `src/games/arena/**` + `src/ui/arena.css`
- Kart agent: `src/games/kart/**` + `src/ui/kart.css`
- Brawl agent: `src/games/brawl/**` + `src/ui/brawl.css`
- Siege agent: `src/games/siege/**` + `src/ui/siege.css`
- `src/meta/stubScene.js` is throwaway; ignore it, don't import it.

## Definition of done (every scene)

1. `npx vite build` passes.
2. Loads via `?scene=<name>&mute=1` with ZERO console errors after 10s of interaction.
3. Screenshot passes the art bar: rich sky + fog, shadows visible, bloom visibly
   working on emissives, nothing default-grey, readable composition.
4. All 12 skill archetypes function (games only).
5. Win AND lose paths reachable and end with banner + stat save + return path to hub.
6. Runs at 60fps-ish (no obvious hitching).
