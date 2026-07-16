# IPL — Immersive Playable League: Module Contracts

Read this fully before writing any code. The shared core/art layer is FROZEN —
do not modify any file outside the ones you own.

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
  // optional: postOpts = { bloom, bloomThreshold, bloomRadius, vignette, grain, saturation }
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
