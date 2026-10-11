# IWL — Immortal Warlords League: Module Contracts

Read this fully before writing any code. File ownership below describes the original scene implementation campaign. For the Astra immersion pass, the user authorized shared core, presentation, and scene lifecycle changes; check current task ownership before editing shared files.

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
  `kart`, `brawl`, `siege`, `duel`.
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

`ctx` = `{ engine, input, audio, profile, saveProfile(), goTo(name, params), preload(name), setTimeout(fn, ms), clearTimeout(id), params }`

- `engine`: `.renderer`, `.envMap` (PMREM texture for `scene.environment`),
  `.shake(amp, dur)`, `.onResize(fn)`. Do NOT call engine.setScene yourself.
- `input`: `.isDown(code)`, `.buttonDown(b)`, `.mouse` (NDC Vector2), `.mousePx`,
  `.onKey(fn(code, isDown, e))`, `.onMouse(fn(button, isDown, e))`, `.onWheel(fn(dy, e))`,
  `.pick(camera, objects)`, `.groundPoint(camera, y, out)` → Vector3 | null.
  Handlers are auto-cleared on scene change — never add raw window listeners for
  gameplay (if you must, remove them in dispose()).
- `audio`: `.play(name, {delay, vol, pan, rate})` — names: click hover back cast dash
  zap hit explode heal shield coin levelup kill tower bounce swish rim buzzer whistle
  crowd countdown go victory defeat spawn hammer quench keytick whoosh. SFX carry
  built-in pitch/volume variation; big moments (victory defeat kill tower go buzzer
  levelup crowd) auto-duck the music. `pan` is -1..1 stereo, `rate` a pitch multiplier.
  `.music(theme)` — themes: hub battle court arena race brawl siege duel; themes
  crossfade. `.ambience(name)` — looping ambience beds crossfaded per scene: hub
  forge rift court pit race chasm gate crucible (or null for silence).
  Call `.music(...)` + `.ambience(...)` once in init(). Audio is NOT stopped between
  scenes — scenes sharing a theme (hub ↔ loadout) play seamlessly.
  `.duck(depth, {hold, release})` — manual music dip for scene-specific moments.
  `.startEngine()` / `.setEngine(speed0to1, boost0to1)` / `.stopEngine()` — the kart
  engine loop; SceneManager backstops stopEngine on scene change.
  `.setVolumes({master, music, sfx, amb})` — persisted to localStorage 'ipl-audio-v1'.
- `profile`: `{ name, champion, skins: {caelan, nyra, orren, serai}, appearance: {championId, skinId, primary, secondary, glow, head, hair, archetype, trail, cape},
  loadout: [4 skill ids], stats: {wins: {}, plays: {}} }`. Mutate then call
  `saveProfile()`. Record results: `profile.stats.wins[game] = (…|0) + 1`.
- `goTo(name, params)`: e.g. `goTo('loadout', { game: 'moba' })`,
  `goTo('hub')`. P / Escape opens the shared pause menu in games. Escape closes it, and leaves the forge for the hub.

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

`src/art/sky.js` — sky({top,mid,bottom, radius, haze, hazeAmt, hazeBand, sunDir,
sunColor, sunSize, sunBoost, stars, moonDir, moonColor, clouds:{color, shade,
amount, scale, speed}}) — procedural dome: 3-stop gradient + horizon haze band
(hazeBand = angular half-width, raise it when treelines occlude the horizon),
HDR sun disc+halo (sunBoost feeds bloom), optional moon, twinkling stars,
drifting patchy fbm clouds. Auto-ticked via the materials registry (NO .tick
call). Exposes uTop/uMid/uBottom/uSunColor uniform names — siege's dawn rig
lerps them. Prefer over skyDome/starField in every scene.

`src/art/backdrop.js` — silhouette horizon kit. ridgeRing({kind:
'peaks'|'pines'|'citadel'|'spires', radius, height, color, seed, y, arc, angle})
— single unlit triangle-strip band; `fog:false` BY DESIGN (scene fog fars would
erase it) — hand-grade ring colors between fog color and sky, paler = farther.
watchFires({ring, count, color, size, seed}) → Points with .tick(dt).
horizonLayers({kind, count, radius:[a,b], height:[a,b], colors:[a,b], seeds,
firesOn, fireColor, y}) → Group with combined .tick(dt) — push to tickables.

`src/art/otherworld.js` — ambient creature/phenomena kit. dragon({scale, color,
membraneColor, eyeColor, fireBreath, breathPeriod, breathDur, seed}) → {group,
.tick(dt)}: articulated drake (pivot-chain neck/tail, 2-joint scalloped-membrane
wings with flap/glide cycles, tucked legs, ember eyes, optional fire cone).
dragonFlight(dragon, {center, radius, height, speed, dir, bob, bank, seed}) →
{group, .tick(dt)} circular flight path with banking — push the FLIGHT object
(not the bare dragon) to tickables; dragon faces +z, seed = start angle/2π.
wyvernFlock({count, center, radius, height, speed, color, scale, seed}) →
{group, .tick(dt)} unlit fog:true silhouettes — cheap, safe for perf-tight
scenes. aurora({color1, color2, radius, y, width, thetaStart, thetaLength,
intensity, speed}) → additive cylinder-band shader, auto-ticked via track() —
EXPENSIVE at dpr2 on gameplay scenes (~10fps in duel; hub/menus only), aim
thetaStart toward -z for the hub camera. COST NOTE: a single scaled dragon in
kart cost ~12fps at dpr2 — keep gameplay-scene dragons rare and distant.

`src/art/characterFactory.js` —
- `createHero(profile.appearance, {auraRing, equipmentPose: 'held'|'stowed'})` → Hero: `.group` (origin at feet, ≈2 units
  tall), `.update(dt)` (call every frame), `.setMoveSpeed(unitsPerSec)` (drives run anim),
  `.setState('normal'|'dance'|'ko')`, `.cast()` (arm-raise anim), `.faceTowards(vec3, dt, rate)`,
  `.castPoint(out)` (world pos of casting hand), `.ring` (ground aura mesh, toggle .visible).
- `unifiedCharacters.js` loads complete local textured assets for Caelan and Nyra (`modelVersion: 4`). Their geometry, UVs and PBR atlases come from the approved full-body production references, with eighteen deformation anchors fitted offline. Orren and Serai still use `rosterModels.js` version 3 pending external mesh generation. `championEquipment.js` owns signature weapons. Legacy NPCs retain `championSculpt.js`.
- Keep `hips`, `torso`, `head`, `gem`, `arms.L/R.{pivot,elbow,glove}` and `legs.L/R.{pivot,knee}` intact. Games directly layer their combat poses over these anchors. Weapon geometry does not change collision, reach or stats.
- Use `hero.hipHeight` for the champion's resting pelvis height, with `.92` only as the legacy fallback. Never force all champions to one height or nonuniformly stretch the whole model.
- Startup awaits `preloadUnifiedCharacters()` and the remaining version 3 textures before enabling entry. `createHero` stays synchronous and fails explicitly if a required asset was not preloaded. `hero.assetsReady` remains a supported promise. Failed startup has a visible reload/retry action. All runtime assets are local; gameplay never calls Hugging Face or needs credentials.
- Version 4 characters use one complete `SkinnedMesh` and one private skeleton per hero. Version 3 human bodies retain their separate material parts. Each hero owns its geometry, materials and texture objects; decoded source images may be shared. Preserve material shader hooks when applying ghost or clone effects, including the facial sampler's multiplication by the diffuse tint. `disposeObject3D` releases skeleton bone textures and the custom `referenceMap` texture.
- Prepared version 4 GLBs reuse the source position storage and contain no unused source body. `_RIGINDEX` is an unnormalized unsigned byte `VEC4` for eighteen anchors; `_RIGWEIGHT` remains float32. Runtime `skinIndex` must accept the loaded integer attribute without assuming a Uint16Array. Packing does not simplify triangles, change UVs or recompress textures.
- Combat and driving poses must add `hero.armRestOffset[key] || 0` to shoulder Z rotation targets. This adapts the source A-pose while preserving the animation intent. Cloth anchors have a smoothed surface weight field and independent secondary motion.
- `setEquipmentPose('stowed')` moves signature gear to the hips/back. Court, chariot and fist-fighting modes, including their clones, use this pose. The other games and forge hold equipment. Orren's shield follows the same rule.
- Version 4 `mats.primary` addresses the complete body for hit flashes, with white diffuse tint preserving its authored texture. Do not assume its color equals `appearance.primary`. Skin variants recolor textile/metal regions while retaining the face. Version 3 aliases retain their existing palette behavior.
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

Vivek approved the current version 4 Caelan and Nyra rendering as the character and game-art benchmark on September 18, 2026. Read [the approved art standard](docs/art-standard.md) and inspect its Forge and gameplay references before changing characters, creatures, equipment, environments or lighting. Compare new art and rendering changes against this baseline; preserve individual silhouettes, coherent faces and bodies, material detail and grounded lighting.

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
- `contrast: 1.03` — post-exposure contrast in the grade pass.
- `aberration: 0` — rest strength of radial chromatic aberration (grade-pass
  uniform uAberr; driven transiently by engine.aberrPulse).

`src/core/engine.js` — `engine.setExposure(v)` sets renderer.toneMappingExposure
(applies live through the composer's OutputPass). `engine.aberrPulse(amt=0.012)`
— decaying chromatic-aberration kick (exp decay); wire to KO/boss-kill moments.
Dynamic resolution: pixel-ratio steps 1→native, steps down <50fps, up >57.5fps
sustained 5s (3s cooldown); `?dpr=1.5` URL lock — perf gates MUST pass it.
`engine.fps` (real frame time), `engine.dprScale` (current effective ratio).

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

three r166. Import addons from `three/addons/...`. No runtime CDNs, remote fonts,
or external network fetches. The approved illustrations live in `public/concepts/images/`.
The anatomical rebuild uses vendored CC0 graphical data in `tools/character-assets/`,
compiled mesh data in `src/art/anatomy/`, and local textures in `public/models/textures/`.
See `docs/champion-models.md` for provenance and generation prompts. Renderer already uses ACES tone mapping +
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


## Astra immersion lifecycle additions

- Use `ctx.setTimeout` and `ctx.clearTimeout` for scene events. They run on simulation time, pause with the game, and are cancelled on scene teardown. Shared `HUD` objects capture this scheduler at construction.
- `engine.elapsedTime` is simulation time. Gameplay timing must use it rather than wall clocks. `engine.setPaused(on, reason)` composes named reasons; transitions and menus cannot accidentally resume each other.
- `input.setBlocked(on, reason)` clears held keys/buttons. `input.onReset(callback)` cancels local input state such as charge meters or dragging. Input handlers ignore UI controls and are cleared on scene change.
- `GameSession` owns pause, resume, restart, hub return, blur/visibility pause, saved graphics preferences, and sound toggling. Dispatch `iwl:settings` from hub UI to open settings.
- `SceneManager.preload` caches module promises; callers doing speculative preload must catch rejection. `goTo` returns success/failure and supplies a visible retry or hub recovery route.
- `disposeObject3D` also releases instanced attributes and light shadow targets. Composer teardown releases all pass targets and shader materials.
- `src/meta/realms.js` owns realm copy and control hints; `realmWorld.js` builds the procedural hub vista. `public/realms/` contains game captures used for the small selection cards.

## Approved champion roster

- `src/meta/champions.js` owns the four champion identities, twelve stable skin IDs, signature defaults, artwork paths, and authored model identity with palette presets.
- `profile.champion` selects a character. `profile.skins[championId]` remembers that character's costume. `selectChampion` changes appearance but preserves the name, four equipped arts, results, and destination realm.
- `loadProfile` validates roster IDs and restores the selected skin's canonical appearance. It preserves validated glow/trail choices, player name, loadout and results. Legacy paint and cape overrides no longer overwrite the authored outfit. New profiles use Caelan / Dawnsworn; each other champion starts with its signature skin.
- Faces and hair follow champion/costume identity. Generic head/hair values remain supported only by legacy NPC models. Forge customization exposes skin choices and battle effects (glow/trail), with a restore-defaults action. Generic paint and cape switches are removed.
- `championSelect.js` builds the artwork preview, roster and skin controls inside the forge. `championPortrait.js` supplies the selected portrait to the hub and shared ability HUD.
- Small portraits are children of the ability bar so cinematic and result visibility rules apply to them. Responsive placement must clear the health/energy bars, race instruments, and pause/help controls.

## CPU difficulty and Crucible modes

- `profile.cpuLevel` is a normalized integer from 1 through 10, default 6. `profile.duelMode` is `tower` (default) or `single`. Both persist on this device without changing roster, loadout or existing results.
- `src/core/cpuDifficulty.js` owns immutable behavior tiers and mode eligibility. Only `brawl` and `duel` with `params.mode === 'single'` receive a non-null `ctx.cpuDifficulty`, snapshotted on scene creation. A pause-menu edit affects the next match or restart, never the active brain's config.
- `SceneManager.goTo('duel', { mode })` normalizes the mode, falling back to the saved preference when omitted. Invalid explicit modes resolve to Tower. Restart preserves the current mode; a direct link may use `?scene=duel&mode=single`.
- `SingleDuelAI` uses delayed visible-state reads and one combo decision per confirmed hit opening. The Tower uses `DuelAI` and stage-specific `TOWER` configurations, with one delayed combo decision per confirmed opening, cooldown-aware approach behavior, and increased wounded pressure from the Eternal. Difficulty changes do not modify fighter health, damage, movement speed, cooldown durations or hitboxes. Brawl's allied Phantom Twin remains fixed at level 5.
- Single Duel faces Ashborn in one best-of-three bout. It records plays and wins under `stats.*.duelSingle`, with rematch and hub return actions, and never advances the Tower. Existing `stats.*.duel` remain Tower records.
- `createCpuPicker` uses native radio inputs. Dispose scene-owned pickers and remove their `iwl:cpu-settings` listeners on teardown. Keep CPU choices out of the Tower and other progression-based battlegrounds.

## Mouse controls

- `Input.mouse` and `mousePx` remain raw cursor coordinates used for picking and aiming. `cameraMouse` scales normalized coordinates by `mouseSensitivity` for camera parallax. `setMouseSensitivity(number)` clamps to 0.25 through 2 (default 1). Never use scaled coordinates for raycasts. Mouse-down refreshes raw coordinates before callbacks.
- `GameSession` persists sensitivity in `iwl-session-v1`; the hub settings and pause menu expose a slider and reset action. Forge drag and War Rift edge scrolling also apply the multiplier.
- `ClickMove` owns scene-local right-click navigation for arena, siege and hoops. It uses the input reset lifecycle, cancels on keyboard movement, and exposes a destination ring disposed with the scene. Siege uses a visibility graph around its citadel. Existing moba movement/attack orders remain scene-owned.
- The Crucible projects right-clicks onto its `z = 0` fighting lane, clamps destinations to fighter `EDGE`, and feeds ordinary walking intent without changing combat physics. Keyboard movement/combat, input resets and round/result transitions cancel the scene-owned order. Grounded opponents stop mouse walking at contact. Both Tower and Single Duel use this behavior.
- War Rift restores a living player's health to current `maxHp` within `FOUNTAIN_RADIUS` (6.75) of the allied shrine at `(-NEXUS_X, 0)`. The restoration runs after combat damage, never revives a dead player, and excludes finished matches and the enemy base. Entering damaged plays healing feedback; staying inside restores health without repeating that feedback.

## Race supplies and Phantom Chorus

- War Chariots reserves the whole scenery footprint plus a shoulder outside the road. `track.distanceToTrack(point)` measures XZ distance to all sampled centerline segments, including the closing segment. Podium scenery registries retain conservative footprint radii.
- `RacePickups` owns eighteen non-solid supply chests with five-second simulation-time respawns. Each racer holds at most one item. F or the supply button consumes the player's item; CPUs collect and use the same supplies. Collection/use stops before GO and after finishing. The existing 1-4 combat arts and boost rings remain separate.
- Shift-click (or Shift+Enter) on Phantom Twin in the Forge equips `decoy` in all four slots. Only this art has that shortcut; normal arts retain swap behavior. Saved duplicate slots have independent cooldowns and all equipped key labels appear on the skill badge.
- Phantom Twin has a 24-second cooldown and a three-second lifetime. The Crucible uses the separate `params.duelDuration` of 0.35 seconds for its lunge. Recasts replace the existing twin per caster, including the Crucible's cached hero; never attach multiple active records to that same hero.

## Tower maintenance, boss encounters and Skyfall

- Last Bastion tower pads expose clickable build/upgrade and repair actions while the living player is within 2.1 units during play. F builds/upgrades; G repairs. Pause, cinematics and results reject actions. Both paths revalidate the current tower, range, gold and construction state before spending.
- Ballista tiers have 60/90/120 maximum HP. Upgrades cost 150/250 gold and restore the new maximum HP. Repairs restore up to 30 HP for `ceil(restoredHP * 0.75)` gold. Full-health, destroyed and constructing towers cannot be repaired. Build/rebuild costs remain 100/50.
- The Pit Warden alternates locked slams, radial volleys and telegraphed charges with recovery windows. Half health triggers enrage plus one reinforcement wave; 20% health triggers a final reinforcement wave.
- The Siege Colossus enrages at half health, alternates close slams with mortars, and telegraphs gate strikes. Mortars select distinct priority towers plus the player when enraged, or the player when no towers remain. Trajectory, warning and damage share a locked target. Boss death and match completion remove pending mortars.
- Blood Court Skyfall Hammer requires live player possession and empowers only the next normal timed shot for five simulation seconds. It slightly widens the timing window and adds a contest-reduced accuracy bonus; bad timing still misses. The hammer visual never scores. Shot release, possession loss and check resets clear the buff. Other realms retain their own Skyfall effects.

## Boss combat arts

- `src/games/shared/bossArts.js` owns scene-local spell warnings, locked targets, simulation timers and hit detection. It snapshots targets at cast start. Full-size warning shapes match the line/circle hit regions; traveling ground waves use swept X collision and can be jumped above 1.05 units. Each wave damages a defender at most once.
- The Pit Warden alternates Cinder Lance and Ashfall; the Siege Colossus alternates three Siegebreaker lanes and Warfire Salvo. These casts supplement existing attacks on a six-second cooldown. The Colossus cannot advance attack timers during its entrance.
- Crucible Tower stages have seven-second signature casts: Ashborn's Cinder Wave, Sera's Frost Spires, Gorehowl's Fault Wave, and the Eternal's alternating Cinder Wave/Skyfall Hex. Regular melee/AI decisions pause during the windup and recovery; ordinary fighter physics remain active. Single Duel retains its CPU-level behavior.
- Signature abilities announce their dodge response and give 0.9-1.15 seconds of warning, plus projectile travel or staggered impact time. They use existing damage defenses, block, invulnerability and KO handling. No world targeting follows the player after a warning appears.
- Boss death, player death, results, round transitions, wave jumps and scene disposal clear pending signature spells. All timing freezes with the scene. Damage callbacks may synchronously clear pending attacks, so the spell loop must detect this before disposing or advancing its current entry.
