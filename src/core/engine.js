import * as THREE from 'three'
import { buildComposer } from './post.js'
import { makeEnvMap } from './assets.js'

/**
 * Owns the renderer, the post-processing composer, the RAF loop and
 * camera shake. Scene modules are mounted via setScene(); per-frame logic
 * runs through `updater` (set by SceneManager) and `addTicker` hooks.
 */
export class Engine {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(innerWidth, innerHeight)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.12
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(this.renderer.domElement)

    this.clock = new THREE.Clock()
    this.scene = null
    this.camera = null
    this.composer = null
    this.updater = null
    this._tickers = new Set()
    this._resizeCbs = new Set()
    this._shake = { t: 0, dur: 1, amp: 0 }
    this._shakeOff = new THREE.Vector3()
    this._aberr = 0

    // Dynamic resolution: step pixelRatio down when fps sags, back up when
    // there's headroom — the guardrail that keeps detail passes at 60fps.
    // ?dpr=1.5 locks the scale (QA/perf probes).
    const params = new URLSearchParams(location.search)
    const native = Math.min(devicePixelRatio || 1, 2)
    this._dprSteps = [1, 1.25, 1.5, 1.75, 2].filter(s => s <= native)
    if (!this._dprSteps.length) this._dprSteps = [native]
    this._dprIdx = this._dprSteps.length - 1
    this._dprLock = params.has('dpr') ? parseFloat(params.get('dpr')) : null
    this._fpsAcc = 0
    this._fpsFrames = 0
    this._dprCooldown = 0
    this._dprUpTime = 0
    this.fps = 60
    this._lastFrameT = performance.now()
    if (this._dprLock) this._applyDpr(this._dprLock)

    addEventListener('resize', () => this._onResize())
  }

  /** Current dynamic-resolution scale (1 = full). */
  get dprScale() { return this._dprLock ?? this._dprSteps[this._dprIdx] }

  _applyDpr(pr) {
    this.renderer.setPixelRatio(pr)
    if (this.composer) {
      this.composer.setPixelRatio(pr)
      this.composer.setSize(innerWidth, innerHeight)
    }
  }

  _watchPerf(now) {
    const frame = now - this._lastFrameT
    this._lastFrameT = now
    this._fpsAcc += frame
    this._fpsFrames++
    if (this._fpsAcc < 1000) return
    this.fps = 1000 / (this._fpsAcc / this._fpsFrames)
    this._fpsAcc = 0
    this._fpsFrames = 0
    if (this._dprLock || !this.composer) return
    this._dprCooldown--
    const stepDown = this.fps < 50 && this._dprIdx > 0
    const stepUp = this.fps > 57.5 && this._dprIdx < this._dprSteps.length - 1
    if (stepDown && this._dprCooldown <= 0) {
      this._dprIdx--
      this._applyDpr(this._dprSteps[this._dprIdx])
      this._dprCooldown = 3
      this._dprUpTime = 0
    } else if (stepUp && this._dprCooldown <= 0) {
      // require 5 consecutive good seconds before scaling back up
      if (++this._dprUpTime >= 5) {
        this._dprIdx++
        this._applyDpr(this._dprSteps[this._dprIdx])
        this._dprCooldown = 3
        this._dprUpTime = 0
      }
    } else {
      this._dprUpTime = 0
    }
  }

  /** Pulse chromatic aberration (impact feel) — decays back to 0 automatically. */
  aberrPulse(amount = 0.012) { this._aberr = Math.max(this._aberr, amount) }

  /** Cached PMREM room environment for PBR materials. */
  get envMap() { return makeEnvMap(this.renderer) }

  /** Global tone-mapping exposure (OutputPass reads it live each frame). */
  setExposure(v) { this.renderer.toneMappingExposure = v }

  setScene(scene, camera, postOpts = {}) {
    this.scene = scene
    this.camera = camera
    this.composer?.dispose?.()
    this.composer = buildComposer(this.renderer, scene, camera, postOpts)
  }

  /** Register a per-frame callback fn(dt, t). Returns unsubscribe. */
  addTicker(fn) { this._tickers.add(fn); return () => this._tickers.delete(fn) }
  onResize(fn) { this._resizeCbs.add(fn); return () => this._resizeCbs.delete(fn) }

  /** Impulse camera shake — safe to call from any scene. */
  shake(amp = 0.35, dur = 0.35) {
    const cur = this._shake.t > 0 ? this._shake.amp * (this._shake.t / this._shake.dur) : 0
    if (amp >= cur) this._shake = { t: dur, dur, amp }
  }

  start() { this.renderer.setAnimationLoop(() => this._tick()) }

  _tick() {
    this._watchPerf(performance.now())
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.elapsedTime
    for (const f of this._tickers) f(dt, t)
    this.updater?.(dt, t)
    if (!this.scene || !this.camera) return

    let shaken = false
    if (this._shake.t > 0) {
      this._shake.t -= dt
      const k = this._shake.amp * Math.pow(Math.max(this._shake.t, 0) / this._shake.dur, 1.4)
      this._shakeOff.set((Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k * 0.4)
      this.camera.position.add(this._shakeOff)
      shaken = true
    }
    if (this.composer) {
      if (this.composer.gradePass) {
        this.composer.gradePass.uniforms.uTime.value = t
        if (this._aberr > 0.0002) {
          this._aberr *= Math.exp(-6 * dt)
          this.composer.gradePass.uniforms.uAberr.value = this._aberr
        } else if (this._aberr !== 0) {
          this._aberr = 0
          this.composer.gradePass.uniforms.uAberr.value = 0
        }
      }
      this.composer.render()
    } else {
      this.renderer.render(this.scene, this.camera)
    }
    if (shaken) this.camera.position.sub(this._shakeOff)
  }

  _onResize() {
    const w = innerWidth, h = innerHeight
    this.renderer.setSize(w, h)
    if (this.camera && this.camera.isPerspectiveCamera) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
    this.composer?.setSize(w, h)
    for (const f of this._resizeCbs) f(w, h)
  }
}
