import * as THREE from 'three'

/**
 * Central input hub. Scene modules subscribe via onKey/onMouse/onWheel;
 * SceneManager clears all subscriptions on every scene change, so modules
 * never need to unsubscribe manually.
 */
export class Input {
  constructor(dom) {
    this.dom = dom
    this._blocks = new Set()
    this.keys = new Set()
    this.keyAliases = {}
    this._aliasSources = {}
    this.buttons = new Set()
    this.mouse = new THREE.Vector2()     // NDC (-1..1)
    this.mousePx = { x: 0, y: 0 }
    this.mouseSensitivity = 1
    this.cameraMouse = new THREE.Vector2()
    this._resetCbs = new Set()
    this._keyCbs = new Set()
    this._mouseCbs = new Set()
    this._wheelCbs = new Set()
    this._ray = new THREE.Raycaster()
    this._plane = new THREE.Plane()

    addEventListener('keydown', e => {
      if (this.blocked || e.defaultPrevented || this.isInteractive(e.target)) return
      if (e.code.startsWith('Arrow')) e.preventDefault()
      if (e.repeat) return
      const code = this.keyAliases[e.code] || e.code
      const held = this.isDown(code)
      this.keys.add(e.code)
      if (!held) this._keyCbs.forEach(f => f(code, true, e))
    })
    addEventListener('keyup', e => {
      const code = this.keyAliases[e.code] || e.code
      const held = this.keys.delete(e.code)
      if (!held || this.blocked || this.isDown(code)) return
      this._keyCbs.forEach(f => f(code, false, e))
    })
    addEventListener('mousemove', e => {
      this.updateMouse(e)
    })
    dom.addEventListener('mousedown', e => {
      if (this.blocked || e.defaultPrevented || this.isInteractive(e.target)) return
      this.updateMouse(e)
      this.buttons.add(e.button)
      this._mouseCbs.forEach(f => f(e.button, true, e))
    })
    addEventListener('mouseup', e => {
      const held = this.buttons.delete(e.button)
      if (!held || this.blocked) return
      this._mouseCbs.forEach(f => f(e.button, false, e))
    })
    dom.addEventListener('contextmenu', e => e.preventDefault())
    addEventListener('wheel', e => { if (!this.blocked && !this.isInteractive(e.target)) this._wheelCbs.forEach(f => f(e.deltaY, e)) }, { passive: true })
    addEventListener('blur', () => this.clearHeld())
    addEventListener('focusin', e => { if (this.isInteractive(e.target)) this.clearHeld() })
  }

  isInteractive(target) {
    return Boolean(target?.closest?.('button, input, textarea, select, a, [contenteditable], [role="dialog"], .ui-interactive'))
  }
  updateMouse(e) {
    this.mousePx.x = e.clientX
    this.mousePx.y = e.clientY
    this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    this.cameraMouse.copy(this.mouse).multiplyScalar(this.mouseSensitivity)
  }
  setMouseSensitivity(value) {
    this.mouseSensitivity = Number.isFinite(value) ? Math.max(0.25, Math.min(2, value)) : 1
    this.cameraMouse.copy(this.mouse).multiplyScalar(this.mouseSensitivity)
  }
  get blocked() { return this._blocks.size > 0 }
  setBlocked(blocked, reason = 'session') {
    if (blocked) this._blocks.add(reason)
    else this._blocks.delete(reason)
    this.clearHeld()
  }
  clearHeld() {
    this.keys.clear()
    this.buttons.clear()
    for (const fn of this._resetCbs) fn()
  }
  onReset(fn) { this._resetCbs.add(fn); return () => this._resetCbs.delete(fn) }

  setKeyAliases(aliases = {}) {
    this.clearHeld()
    this.keyAliases = { ...aliases }
    this._aliasSources = {}
    for (const [source, target] of Object.entries(aliases)) {
      (this._aliasSources[target] ||= []).push(source)
    }
  }

  isDown(code) { return this.keys.has(code) || Boolean(this._aliasSources[code]?.some(source => this.keys.has(source))) }
  buttonDown(b = 0) { return this.buttons.has(b) }

  onKey(fn) { this._keyCbs.add(fn); return () => this._keyCbs.delete(fn) }
  onMouse(fn) { this._mouseCbs.add(fn); return () => this._mouseCbs.delete(fn) }
  onWheel(fn) { this._wheelCbs.add(fn); return () => this._wheelCbs.delete(fn) }

  /** Called by SceneManager on scene change. */
  clearHandlers() {
    this._resetCbs.clear()
    this.clearHeld()
    this.keyAliases = {}
    this._aliasSources = {}
    this._keyCbs.clear()
    this._mouseCbs.clear()
    this._wheelCbs.clear()
  }

  /** Raycast current cursor against objects. Returns intersections array. */
  pick(camera, objects, recursive = true) {
    this._ray.setFromCamera(this.mouse, camera)
    return this._ray.intersectObjects(objects, recursive)
  }

  /** Project current cursor onto a horizontal plane at height y. Returns Vector3 or null. */
  groundPoint(camera, y = 0, out = new THREE.Vector3()) {
    this._ray.setFromCamera(this.mouse, camera)
    this._plane.set(new THREE.Vector3(0, 1, 0), -y)
    return this._ray.ray.intersectPlane(this._plane, out)
  }
}
