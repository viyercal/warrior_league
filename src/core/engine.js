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
    addEventListener('resize', () => this._onResize())
  }

  /** Cached PMREM room environment for PBR materials. */
  get envMap() { return makeEnvMap(this.renderer) }

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
      if (this.composer.gradePass) this.composer.gradePass.uniforms.uTime.value = t
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
