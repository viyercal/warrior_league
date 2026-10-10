import * as THREE from 'three'

/** Scene-owned ground navigation. Input resets cancel orders, including on pause. */
export class ClickMove {
  constructor({ input, camera, scene, position, active, clamp, obstacle, vfx }) {
    Object.assign(this, { input, camera, position, active, clamp, obstacle, vfx })
    this.points = []
    this.scratch = new THREE.Vector3()
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), new THREE.MeshBasicMaterial({ color: '#dfbf87', depthWrite: false, side: THREE.DoubleSide }))
    this.marker.rotation.x = -Math.PI / 2
    this.marker.visible = false
    scene.add(this.marker)
    input.onReset(() => this.cancel())
    input.onKey((code, down) => { if (down && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code)) this.cancel() })
    input.onMouse((button, down) => {
      if (button !== 2 || !down || !active()) return
      if (!input.groundPoint(camera, 0, this.scratch)) return
      clamp(this.scratch)
      this.points = this.route(position(), this.scratch)
      this.marker.position.copy(this.scratch).setY(0.08)
      this.marker.visible = this.points.length > 0
      if (this.marker.visible) vfx.ring(this.scratch, { color: '#dfbf87', radius: 0.7, life: 0.35 })
    })
  }

  cancel() { this.points.length = 0; this.marker.visible = false }

  // Visibility graph around the citadel, evaluated only when issuing an order.
  route(start, target) {
    if (!this.obstacle) return [target.clone()]
    const { x, z, radius } = this.obstacle
    const clear = (a, b) => {
      const dx = b.x - a.x, dz = b.z - a.z
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)))
      return Math.hypot(a.x + t * dx - x, a.z + t * dz - z) >= radius - 0.01
    }
    if (clear(start, target)) return [target.clone()]
    const nodes = [start.clone(), target.clone()]
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI * 2 / 32
      const p = new THREE.Vector3(x + Math.cos(a) * (radius + 0.35), 0, z + Math.sin(a) * (radius + 0.35))
      const bounded = this.clamp(p.clone())
      if (p.distanceTo(bounded) < 0.01) nodes.push(p)
    }
    const distances = nodes.map(() => Infinity), prev = [], visited = new Set()
    distances[0] = 0
    for (let step = 0; step < nodes.length; step++) {
      let u = -1
      for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (u < 0 || distances[i] < distances[u])) u = i
      if (u < 0 || !Number.isFinite(distances[u])) break
      if (u === 1) {
        const path = []
        for (let i = 1; i !== 0; i = prev[i]) path.unshift(nodes[i])
        return path
      }
      visited.add(u)
      for (let i = 0; i < nodes.length; i++) {
        if (visited.has(i) || !clear(nodes[u], nodes[i])) continue
        const d = distances[u] + nodes[u].distanceTo(nodes[i])
        if (d < distances[i]) { distances[i] = d; prev[i] = u }
      }
    }
    return []
  }

  direction(out, tolerance = 0.12) {
    out.set(0, 0, 0)
    if (!this.active()) { this.cancel(); return 0 }
    while (this.points.length) {
      out.copy(this.points[0]).sub(this.position()).setY(0)
      const distance = out.length()
      if (distance > tolerance) { out.divideScalar(distance); return distance }
      this.points.shift()
    }
    this.cancel()
    out.set(0, 0, 0)
    return 0
  }
}
