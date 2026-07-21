/**
 * Otherworld kit — dragons, wyvern flocks, aurora ribbons.
 * All procedural, silhouette-first (they read against the sky, never up close).
 * Perf: one dragon ≈ 25 cheap meshes sharing 2 lit materials; wyverns are
 * unlit 4-part silhouettes with fog on (free aerial perspective).
 *
 * Tick contract: dragonFlight()/wyvernFlock() return objects with .tick(dt) —
 * push THAT to scene tickables and it animates path + creature. A bare
 * dragon() has its own .tick(dt) (wings/spine/breath) for perched use.
 * aurora() is auto-ticked via the materials registry (no call needed).
 */
import * as THREE from 'three'
import { track, emberGlowMaterial, glowSpriteMaterial, fireMaterial } from './materials.js'

// ---------- shared geometry/material caches (never disposed — module lifetime) ----------
const G = {}
function geo() {
  if (G.done) return G
  G.chest = new THREE.CapsuleGeometry(0.42, 1.5, 4, 10).rotateX(Math.PI / 2)
  G.hips = new THREE.SphereGeometry(0.38, 10, 8).scale(0.95, 0.8, 1.35)
  G.neckSeg = [0.26, 0.2, 0.15].map((r, i) =>
    new THREE.CylinderGeometry(r, [0.3, 0.26, 0.2][i], 0.62, 8).rotateX(Math.PI / 2).translate(0, 0, 0.31))
  G.cranium = new THREE.BoxGeometry(0.34, 0.3, 0.5)
  G.snout = new THREE.BoxGeometry(0.2, 0.16, 0.46).translate(0, 0, 0.2)
  G.jaw = new THREE.BoxGeometry(0.18, 0.06, 0.4).translate(0, 0, 0.18)
  G.horn = new THREE.ConeGeometry(0.05, 0.46, 6).rotateX(-Math.PI / 2 - 0.5)
  G.eye = new THREE.SphereGeometry(0.05, 6, 6)
  G.tailSeg = [0.26, 0.18, 0.11, 0.05].map((r, i) =>
    new THREE.CylinderGeometry(r, [0.32, 0.26, 0.18, 0.11][i], 0.78, 8).rotateX(Math.PI / 2).translate(0, 0, -0.39))
  G.spade = new THREE.ConeGeometry(0.15, 0.5, 6).rotateX(-Math.PI / 2).scale(1.7, 0.4, 1)
  G.thigh = new THREE.CapsuleGeometry(0.1, 0.34, 3, 6)
  G.shin = new THREE.CapsuleGeometry(0.06, 0.3, 3, 6)
  G.wingBone = new THREE.CylinderGeometry(0.075, 0.055, 1.2, 6).rotateZ(Math.PI / 2).translate(0.6, 0, 0)
  G.finger = new THREE.CylinderGeometry(0.045, 0.02, 1.25, 6)
  G.fireCone = new THREE.ConeGeometry(0.42, 2.6, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 1.3)
  // wyvern parts (tiny silhouettes)
  G.wBody = new THREE.CapsuleGeometry(0.14, 0.7, 3, 6).rotateX(Math.PI / 2)
  G.wTail = new THREE.CylinderGeometry(0.02, 0.09, 0.7, 5).rotateX(Math.PI / 2).translate(0, 0, -0.6)
  G.wHead = new THREE.ConeGeometry(0.09, 0.34, 5).rotateX(Math.PI / 2).translate(0, 0.02, 0.55)
  G.done = true
  return G
}

/** Scalloped bat-wing membrane. side=+1 builds in +x (left wing), -1 mirrors. */
function membraneGeo(side) {
  const s = side
  const inner = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0.05 * s, 0, 0.55), new THREE.Vector3(1.15 * s, 0, 0.42),
    new THREE.Vector3(1.05 * s, 0, -0.5), new THREE.Vector3(0.1 * s, 0, -0.55),
  ])
  inner.setIndex(s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])
  inner.computeVertexNormals()
  // outer fan lives in elbow space (origin at wrist) so it folds with the joint
  const outer = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.15 * s, 0, -0.37),
    new THREE.Vector3(0.85 * s, 0, -1.02), new THREE.Vector3(-0.1 * s, 0, -0.92),
  ])
  outer.setIndex(s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])
  outer.computeVertexNormals()
  return { inner, outer }
}

/** One wing: shoulder pivot (flap) + elbow pivot (fold) + membrane. */
function wing(side, mats) {
  const g = geo()
  const { inner, outer } = membraneGeo(side)
  const shoulder = new THREE.Group()
  const upper = new THREE.Mesh(g.wingBone, mats.body)
  if (side < 0) upper.rotation.y = Math.PI
  const innerMem = new THREE.Mesh(inner, mats.membrane)
  const elbow = new THREE.Group()
  elbow.position.set(1.15 * side, 0, 0.42)
  // finger spike along the leading edge (wrist -> tip1)
  const tip = new THREE.Vector3(1.15 * side, 0, -0.37)
  const finger = new THREE.Mesh(g.finger, mats.body)
  finger.position.copy(tip).multiplyScalar(0.5)
  finger.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().normalize())
  const outerMem = new THREE.Mesh(outer, mats.membrane)
  elbow.add(finger, outerMem)
  shoulder.add(upper, innerMem, elbow)
  return { shoulder, elbow }
}

/**
 * The dragon. Faces +z, origin at the chest, ~5.4 units long before `scale`.
 * opts: scale, color, membraneColor, eyeColor, fireBreath, breathPeriod,
 * breathDur, seed (desyncs multiple dragons).
 */
export function dragon({
  scale = 1, color = '#16121a', membraneColor = '#241620', eyeColor = '#ff8c3b',
  fireBreath = false, breathPeriod = 14, breathDur = 1.6, seed = 0,
} = {}) {
  const g = geo()
  const mats = {
    body: new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.12 }),
    membrane: new THREE.MeshStandardMaterial({ color: membraneColor, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
    eye: emberGlowMaterial(1.8, eyeColor),
  }
  const group = new THREE.Group()
  const chest = new THREE.Mesh(g.chest, mats.body)
  const hips = new THREE.Mesh(g.hips, mats.body)
  hips.position.z = -0.75
  group.add(chest, hips)

  // neck chain -> head
  const neck = []
  let parent = group, z = 0.72, y = 0.16
  const neckPitch = [-0.5, -0.3, -0.14]
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group()
    pivot.position.set(0, y, z)
    pivot.rotation.x = neckPitch[i]
    pivot.add(new THREE.Mesh(g.neckSeg[i], mats.body))
    parent.add(pivot)
    neck.push(pivot)
    parent = pivot
    y = 0; z = 0.62
  }
  const head = new THREE.Group()
  head.position.set(0, 0.05, 0.62)
  head.add(new THREE.Mesh(g.cranium, mats.body))
  const snout = new THREE.Mesh(g.snout, mats.body)
  snout.position.set(0, -0.03, 0.24)
  const jaw = new THREE.Mesh(g.jaw, mats.body)
  jaw.position.set(0, -0.13, 0.2)
  jaw.rotation.x = 0.14
  head.add(snout, jaw)
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(g.horn, mats.body)
    horn.position.set(0.12 * s, 0.17, -0.12)
    head.add(horn)
    const eye = new THREE.Mesh(g.eye, mats.eye)
    eye.position.set(0.14 * s, 0.07, 0.22)
    head.add(eye)
  }
  parent.add(head)

  // tail chain + spade
  const tail = []
  parent = group
  z = -1.05
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group()
    pivot.position.set(0, i === 0 ? 0.02 : 0, z)
    pivot.rotation.x = 0.12
    pivot.add(new THREE.Mesh(g.tailSeg[i], mats.body))
    parent.add(pivot)
    tail.push(pivot)
    parent = pivot
    z = -0.78
  }
  const spade = new THREE.Mesh(g.spade, mats.membrane)
  spade.position.z = -0.85
  parent.add(spade)

  // tucked legs (flight silhouette)
  for (const [sx, sz] of [[-1, 0.45], [1, 0.45], [-1, -0.68], [1, -0.68]]) {
    const leg = new THREE.Group()
    leg.position.set(0.3 * sx, -0.3, sz)
    const thigh = new THREE.Mesh(g.thigh, mats.body)
    thigh.rotation.x = sz > 0 ? 1.9 : 2.2
    const shin = new THREE.Mesh(g.shin, mats.body)
    shin.position.set(0.02 * sx, -0.16, sz > 0 ? -0.2 : 0.22)
    shin.rotation.x = sz > 0 ? -2.4 : -2.0
    leg.add(thigh, shin)
    group.add(leg)
  }

  // wings
  const wl = wing(1, mats), wr = wing(-1, mats)
  wl.shoulder.position.set(0.38, 0.24, 0.28)
  wr.shoulder.position.set(-0.38, 0.24, 0.28)
  group.add(wl.shoulder, wr.shoulder)

  // fire breath: cone (v=0 at mouth) + mouth glow, hidden until the breath window
  let fire = null, mouthGlow = null
  if (fireBreath) {
    fire = new THREE.Mesh(g.fireCone, fireMaterial({ intensity: 2.2, speed: 2.2 }))
    fire.position.set(0, -0.08, 1.15)
    fire.rotation.x = 0.12
    fire.scale.setScalar(0.001)
    fire.visible = false
    mouthGlow = new THREE.Sprite(glowSpriteMaterial(eyeColor, 0.55))
    mouthGlow.scale.set(0.7, 0.7, 1)
    mouthGlow.position.set(0, -0.05, 0.85)
    group.add(fire, mouthGlow)
  }

  group.scale.setScalar(scale)
  group.name = 'dragon'
  let t = seed * 37.7, flap = seed * 11.3
  return {
    group,
    tick(dt) {
      t += dt
      // flap bursts alternating with glides
      const amp = 0.18 + 0.82 * THREE.MathUtils.smoothstep(0.5 + 0.5 * Math.sin(t * 0.31 + seed), 0.25, 0.65)
      flap += dt * 6.4 * (0.3 + amp)
      const lift = Math.sin(flap) * 0.85 * amp + 0.12
      wl.shoulder.rotation.z = lift
      wr.shoulder.rotation.z = -lift
      const fold = Math.sin(flap - 0.7) * 0.5 * amp - 0.12
      wl.elbow.rotation.z = -fold
      wr.elbow.rotation.z = fold
      // serpentine sway through neck/tail chains
      for (let i = 0; i < 3; i++) neck[i].rotation.y = Math.sin(t * 1.9 - i * 0.55) * 0.05
      for (let i = 0; i < 4; i++) tail[i].rotation.y = Math.sin(t * 1.9 - 1.2 - i * 0.65) * 0.09
      head.rotation.y = Math.sin(t * 0.43) * 0.16
      if (fire) {
        const phase = t % breathPeriod
        const on = phase < breathDur
        fire.visible = on
        if (on) {
          const k = Math.min(1, phase * 6) * Math.min(1, (breathDur - phase) * 4 + 0.2)
          fire.scale.set(k, k, 0.6 + 0.4 * k)
        }
        mouthGlow.material.opacity = on ? 0.9 : 0.4 + 0.15 * Math.sin(t * 2.1)
      }
    },
  }
}

/**
 * Circular flight path for a dragon. Banking roll + vertical bob included;
 * ticks the dragon itself. dir=+1 orbits counter-clockwise (seen from above).
 */
export function dragonFlight(d, {
  center = [0, 0, 0], radius = 150, height = 45, speed = 0.05, dir = 1, bob = 5, bank = 0.32, seed = 0,
} = {}) {
  const c = new THREE.Vector3(...center)
  const pos = new THREE.Vector3(), next = new THREE.Vector3()
  let a = seed * Math.PI * 2
  const at = (ang, out) => out.set(
    c.x + Math.cos(ang) * radius,
    c.y + height + Math.sin(ang * 2.3 + seed * 9) * bob,
    c.z + Math.sin(ang) * radius,
  )
  return {
    group: d.group,
    tick(dt) {
      a += speed * dir * dt
      at(a, pos)
      at(a + 0.03 * dir, next)
      d.group.position.copy(pos)
      d.group.lookAt(next)
      d.group.rotateZ(-bank * dir)
      d.tick(dt)
    },
  }
}

/**
 * Distant wyverns — unlit silhouettes orbiting far off (fog gives the aerial
 * perspective for free). One flock = `count` × 4 cheap meshes, 1 material.
 */
export function wyvernFlock({
  count = 3, center = [0, 0, 0], radius = 140, height = 40, speed = 0.06,
  color = '#120c12', scale = 1, seed = 1,
} = {}) {
  const g = geo()
  const mat = new THREE.MeshBasicMaterial({ color, fog: true })
  const group = new THREE.Group()
  const birds = []
  const rng = (i, k) => {
    const x = Math.sin(seed * 127.1 + i * 311.7 + k * 74.7) * 43758.5453
    return x - Math.floor(x)
  }
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group()
    b.add(new THREE.Mesh(g.wBody, mat), new THREE.Mesh(g.wTail, mat), new THREE.Mesh(g.wHead, mat))
    const wings = []
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(membraneGeo(s).outer, mat)
      w.scale.setScalar(0.55)
      w.position.set(0.1 * s, 0.06, 0.05)
      b.add(w)
      wings.push(w)
    }
    b.scale.setScalar(scale * (0.8 + rng(i, 1) * 0.5))
    group.add(b)
    birds.push({
      g: b, wings,
      a: rng(i, 2) * Math.PI * 2,
      r: radius * (0.88 + rng(i, 3) * 0.3),
      h: height + rng(i, 4) * 9,
      sp: speed * (0.85 + rng(i, 5) * 0.4),
      flap: rng(i, 6) * 9,
    })
  }
  const pos = new THREE.Vector3(), next = new THREE.Vector3()
  return {
    group,
    tick(dt) {
      for (const b of birds) {
        b.a += b.sp * dt
        const set = (ang, out) => out.set(
          center[0] + Math.cos(ang) * b.r, center[1] + b.h + Math.sin(ang * 3.1) * 1.6, center[2] + Math.sin(ang) * b.r)
        set(b.a, pos)
        set(b.a + 0.04, next)
        b.g.position.copy(pos)
        b.g.lookAt(next)
        b.flap += dt * 7.5
        const l = Math.sin(b.flap) * 0.7 + 0.1
        b.wings[0].rotation.z = -l
        b.wings[1].rotation.z = l
      }
    },
  }
}

/**
 * Aurora ribbon — additive shader band on a cylinder segment high in the sky.
 * Auto-ticked via the materials registry; place and forget.
 */
export function aurora({
  color1 = '#2fbf8f', color2 = '#7a4ad0', radius = 320, y = 90, width = 70,
  thetaStart = 0, thetaLength = 1.4, intensity = 0.4, speed = 1,
} = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uC1: { value: new THREE.Color(color1) },
      uC2: { value: new THREE.Color(color2) },
      uIntensity: { value: intensity },
      uSpeed: { value: speed },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uIntensity, uSpeed;
      uniform vec3 uC1, uC2;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float t = uTime * uSpeed;
        float n = vnoise(vec2(vUv.x * 7.0 + t * 0.05, vUv.y * 2.0 - t * 0.03))
                + 0.5 * vnoise(vec2(vUv.x * 15.0 - t * 0.07, vUv.y * 4.0));
        n *= 0.66;
        float band = smoothstep(0.02, 0.3, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
        float rays = 0.55 + 0.45 * sin(vUv.x * 40.0 + n * 6.0 + t * 0.15);
        float a = band * rays * n * uIntensity;
        vec3 col = mix(uC1, uC2, clamp(vUv.y + n * 0.4 - 0.2, 0.0, 1.0));
        gl_FragColor = vec4(col * a, a);
      }`,
  })
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 48, 1, true, thetaStart, thetaLength), mat)
  mesh.position.y = y
  mesh.renderOrder = -9
  track(mat)
  return mesh
}
