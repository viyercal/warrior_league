import * as THREE from 'three'

/**
 * Central input hub. Scene modules subscribe via onKey/onMouse/onWheel;
 * SceneManager clears all subscriptions on every scene change, so modules
 * never need to unsubscribe manually.
 */
export class Input {
  constructor(dom) {
    this.dom = dom
    this.keys = new Set()
    this.buttons = new Set()
    this.mouse = new THREE.Vector2()     // NDC (-1..1)
    this.mousePx = { x: 0, y: 0 }
    this._keyCbs = new Set()
    this._mouseCbs = new Set()
    this._wheelCbs = new Set()
    this._ray = new THREE.Raycaster()
    this._plane = new THREE.Plane()

    addEventListener('keydown', e => {
      if (e.repeat) return
      this.keys.add(e.code)
      this._keyCbs.forEach(f => f(e.code, true, e))
    })
    addEventListener('keyup', e => {
      this.keys.delete(e.code)
      this._keyCbs.forEach(f => f(e.code, false, e))
    })
    addEventListener('mousemove', e => {
      this.mousePx.x = e.clientX
      this.mousePx.y = e.clientY
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    })
    dom.addEventListener('mousedown', e => {
      this.buttons.add(e.button)
      this._mouseCbs.forEach(f => f(e.button, true, e))
    })
    addEventListener('mouseup', e => {
      this.buttons.delete(e.button)
      this._mouseCbs.forEach(f => f(e.button, false, e))
    })
    dom.addEventListener('contextmenu', e => e.preventDefault())
    addEventListener('wheel', e => this._wheelCbs.forEach(f => f(e.deltaY, e)), { passive: true })
    addEventListener('blur', () => {
      this.keys.clear()
      this.buttons.clear()
    })
  }

  isDown(code) { return this.keys.has(code) }
  buttonDown(b = 0) { return this.buttons.has(b) }

  onKey(fn) { this._keyCbs.add(fn); return () => this._keyCbs.delete(fn) }
  onMouse(fn) { this._mouseCbs.add(fn); return () => this._mouseCbs.delete(fn) }
  onWheel(fn) { this._wheelCbs.add(fn); return () => this._wheelCbs.delete(fn) }

  /** Called by SceneManager on scene change. */
  clearHandlers() {
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
