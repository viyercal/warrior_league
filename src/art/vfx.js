import * as THREE from 'three'
import { glowTexture } from '../core/assets.js'
import { rand, TAU, clamp } from '../core/utils.js'

const easeOut = k => 1 - Math.pow(1 - k, 3)

const TRAIL_VERT = /* glsl */ `
attribute float aAge;
uniform float uSize;
varying float vA;
void main() {
  vA = clamp(1.0 - aAge, 0.0, 1.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (0.35 + 0.65 * vA) * (280.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const TRAIL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform sampler2D uMap;
varying float vA;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(uColor * 1.6, tex.a * vA);
}`

/**
 * Per-scene VFX pool. Construct with the scene, call update(dt) every frame,
 * dispose() on teardown (SceneManager's deep-dispose also covers leftovers).
 * All effects are fire-and-forget unless a handle is returned.
 */
export class VFX {
  constructor(scene) {
    this.scene = scene
    this.items = new Set()
  }

  _add(item) { this.items.add(item); return item }

  /** Radial particle explosion. */
  burst(pos, { color = '#ffffff', count = 26, speed = 8, size = 0.32, life = 0.6, gravity = -10, up = 2.5 } = {}) {
    const positions = new Float32Array(count * 3)
    const vels = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const a = rand(TAU), z = rand(-1, 1), r = Math.sqrt(1 - z * z)
      const s = speed * rand(0.35, 1)
      vels.set([Math.cos(a) * r * s, z * s + up, Math.sin(a) * r * s], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      map: glowTexture(), color, size, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const pts = new THREE.Points(geo, mat)
    pts.position.copy(pos)
    this.scene.add(pts)
    let t = 0
    this._add({
      update: dt => {
        t += dt
        if (t >= life) return false
        const p = geo.attributes.position
        for (let i = 0; i < count; i++) {
          vels[i * 3 + 1] += gravity * dt
          p.setXYZ(i, p.getX(i) + vels[i * 3] * dt, p.getY(i) + vels[i * 3 + 1] * dt, p.getZ(i) + vels[i * 3 + 2] * dt)
        }
        p.needsUpdate = true
        mat.opacity = 1 - t / life
        return true
      },
      dispose: () => { this.scene.remove(pts); geo.dispose(); mat.dispose() },
    })
  }

  /** Expanding ground ring shockwave. */
  ring(pos, { color = '#ffffff', radius = 4, life = 0.45, y = 0.06, width = 0.35, hdr = 1.7 } = {}) {
    const geo = new THREE.RingGeometry(Math.max(0.01, 1 - width / radius), 1, 48)
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(hdr), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(pos.x, y, pos.z)
    this.scene.add(mesh)
    let t = 0
    this._add({
      update: dt => {
        t += dt
        if (t >= life) return false
        const k = easeOut(t / life)
        mesh.scale.setScalar(0.15 + k * radius)
        mat.opacity = 0.95 * (1 - k)
        return true
      },
      dispose: () => { this.scene.remove(mesh); geo.dispose(); mat.dispose() },
    })
  }

  /** Quick billboard glow pop. */
  flash(pos, { color = '#ffffff', size = 2.2, life = 0.22 } = {}) {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const s = new THREE.Sprite(mat)
    s.position.copy(pos)
    this.scene.add(s)
    let t = 0
    this._add({
      update: dt => {
        t += dt
        if (t >= life) return false
        const k = t / life
        s.scale.setScalar(size * (0.4 + 1.6 * easeOut(k)))
        mat.opacity = Math.pow(1 - k, 1.4)
        return true
      },
      dispose: () => { this.scene.remove(s); mat.dispose() },
    })
  }

  /** Straight energy beam between two points. */
  beam(a, b, { color = '#9fd8ff', width = 0.14, life = 0.15, hdr = 2 } = {}) {
    const dir = b.clone().sub(a)
    const len = dir.length()
    if (len < 0.01) return
    const geo = new THREE.CylinderGeometry(width, width, 1, 6, 1, true)
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(hdr), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.scale.y = len
    mesh.position.copy(a).addScaledVector(dir, 0.5)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
    this.scene.add(mesh)
    let t = 0
    this._add({
      update: dt => {
        t += dt
        if (t >= life) return false
        mat.opacity = 0.9 * (1 - t / life)
        return true
      },
      dispose: () => { this.scene.remove(mesh); geo.dispose(); mat.dispose() },
    })
  }

  /** Jagged lightning bolt between two points. */
  lightning(a, b, { color = '#cfe9ff', segs = 8, width = 0.07, life = 0.18, jitter = 0.6 } = {}) {
    const pts = []
    for (let i = 0; i <= segs; i++) {
      const k = i / segs
      const p = a.clone().lerp(b, k)
      const amp = Math.sin(k * Math.PI) * jitter
      p.x += rand(-amp, amp); p.y += rand(-amp, amp); p.z += rand(-amp, amp)
      pts.push(p)
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs * 2, width, 4, false)
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    this.scene.add(mesh)
    this.flash(b, { color, size: 1.6, life: 0.18 })
    let t = 0
    this._add({
      update: dt => {
        t += dt
        if (t >= life) return false
        mat.opacity = 1 - t / life
        return true
      },
      dispose: () => { this.scene.remove(mesh); geo.dispose(); mat.dispose() },
    })
  }

  /**
   * Visual projectile (games own the gameplay logic — poll handle.pos for
   * collisions and call handle.kill()). Returns { pos, vel, alive, kill }.
   */
  projectile({ from, dir = null, to = null, speed = 22, color = '#66ddff', size = 0.34, life = 3, gravity = 0, trail = true, light = 0 } = {}) {
    const group = new THREE.Group()
    group.position.copy(from)
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.5, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.4) }),
    )
    group.add(core)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    halo.scale.setScalar(size * 4)
    group.add(halo)
    if (light > 0) group.add(new THREE.PointLight(color, light, 9))
    this.scene.add(group)

    const d = dir ? dir.clone().normalize() : to.clone().sub(from).normalize()
    const handle = {
      pos: group.position,
      vel: d.multiplyScalar(speed),
      alive: true,
      kill: () => { handle.alive = false },
    }
    let trailHandle = null
    if (trail) trailHandle = this.trail(group, { color, size: size * 2.2, rate: 70 })
    let t = 0
    this._add({
      update: dt => {
        if (!handle.alive) return false
        t += dt
        if (t >= life) { handle.alive = false; return false }
        handle.vel.y += gravity * dt
        group.position.addScaledVector(handle.vel, dt)
        return true
      },
      dispose: () => { trailHandle?.stop(); this.scene.remove(group); core.geometry.dispose(); core.material.dispose(); halo.material.dispose() },
    })
    return handle
  }

  /** Spark trail following an Object3D. Returns { stop }. */
  trail(target, { color = '#66ddff', size = 0.5, rate = 50, life = 0.45, jitter = 0.08 } = {}) {
    const CAP = 220
    const positions = new Float32Array(CAP * 3).fill(9999)
    const ages = new Float32Array(CAP).fill(1)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aAge', new THREE.BufferAttribute(ages, 1))
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uMap: { value: glowTexture() }, uSize: { value: size } },
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const pts = new THREE.Points(geo, mat)
    pts.frustumCulled = false
    this.scene.add(pts)

    let head = 0, acc = 0, stopped = false, fadeT = 0
    const wp = new THREE.Vector3()
    const handle = { stop: () => { stopped = true } }
    this._add({
      update: dt => {
        for (let i = 0; i < CAP; i++) ages[i] = Math.min(1, ages[i] + dt / life)
        if (!stopped && target.parent) {
          target.getWorldPosition(wp)
          acc += rate * dt
          while (acc >= 1) {
            acc -= 1
            positions.set([wp.x + rand(-jitter, jitter), wp.y + rand(-jitter, jitter), wp.z + rand(-jitter, jitter)], head * 3)
            ages[head] = 0
            head = (head + 1) % CAP
          }
        } else if (stopped) {
          fadeT += dt
          if (fadeT > life) return false
        }
        geo.attributes.position.needsUpdate = true
        geo.attributes.aAge.needsUpdate = true
        return true
      },
      dispose: () => { this.scene.remove(pts); geo.dispose(); mat.dispose() },
    })
    return handle
  }

  /** Floating world-space text (damage numbers, "+15g", "PERFECT!"). */
  text(pos, str, { color = '#ffffff', size = 1, life = 0.9, rise = 1.7, outline = '#101426' } = {}) {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    const font = '900 68px Avenir Next, Arial Black, sans-serif'
    ctx.font = font
    const w = Math.ceil(ctx.measureText(str).width) + 40
    c.width = w
    c.height = 96
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 12
    ctx.strokeStyle = outline
    ctx.strokeText(str, w / 2, 50)
    ctx.fillStyle = color
    ctx.fillText(str, w / 2, 50)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
    const s = new THREE.Sprite(mat)
    s.renderOrder = 999
    s.position.copy(pos)
    s.scale.set((w / 96) * size, size, 1)
    this.scene.add(s)
    let t = 0
    this._add({
      update: dt => {
        t += dt
        if (t >= life) return false
        const k = t / life
        s.position.y += rise * dt * (1 - k * 0.6)
        const pop = t < 0.12 ? 0.5 + 4.2 * t : 1
        s.scale.set((w / 96) * size * pop, size * pop, 1)
        mat.opacity = k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1
        return true
      },
      dispose: () => { this.scene.remove(s); mat.dispose(); tex.dispose() },
    })
  }

  /** Convenience combo: hit feedback at a point. */
  impact(pos, { color = '#ffd166', size = 1 } = {}) {
    this.flash(pos, { color, size: 1.8 * size })
    this.burst(pos, { color, count: Math.round(16 * size) + 6, speed: 6.5 * size, size: 0.26 * size })
  }

  /** Convenience combo: big ground slam. */
  shockwave(pos, { color = '#ffd166', radius = 5 } = {}) {
    this.ring(pos, { color, radius, life: 0.5 })
    this.ring(pos, { color: '#ffffff', radius: radius * 0.6, life: 0.35, width: 0.2 })
    this.flash(new THREE.Vector3(pos.x, pos.y + 0.8, pos.z), { color, size: radius * 0.9 })
    this.burst(pos, { color, count: 34, speed: radius * 1.7, up: 5 })
  }

  update(dt) {
    for (const item of this.items) {
      if (!item.update(dt)) {
        item.dispose()
        this.items.delete(item)
      }
    }
  }

  dispose() {
    for (const item of this.items) item.dispose()
    this.items.clear()
  }
}
