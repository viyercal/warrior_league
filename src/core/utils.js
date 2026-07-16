import * as THREE from 'three'

export const TAU = Math.PI * 2

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const lerp = (a, b, t) => a + (b - a) * t
/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt))
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a))
export const randInt = (a, b) => Math.floor(rand(a, b + 1))
export const pick = arr => arr[Math.floor(Math.random() * arr.length)]

/** Shortest-path angle interpolation. */
export function angleLerp(a, b, t) {
  const d = ((((b - a) % TAU) + TAU * 1.5) % TAU) - Math.PI
  return a + d * t
}

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

/** Distance in the XZ plane (ignores height). */
export function distXZ(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z
  return Math.hypot(dx, dz)
}

/** Deep-dispose an Object3D subtree: geometries, materials, textures. */
export function disposeObject3D(root) {
  root.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose()
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
    for (const m of mats) {
      for (const key of Object.keys(m)) {
        const val = m[key]
        if (val && val.isTexture) val.dispose()
      }
      m.dispose()
    }
  })
}
