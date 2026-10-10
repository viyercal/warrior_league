import * as THREE from 'three'
import { woodMaterial, ironMaterial, bronzeMaterial } from '../../art/materials.js'

export const RACE_ITEMS = Object.freeze({
  boost: { name: 'FIRE DRAUGHT', hint: 'Burst of speed', icon: 'flame' },
  bolt: { name: 'HUNTER BOLT', hint: 'Seeks the racer ahead', icon: 'comet' },
  slick: { name: 'ASH FLASK', hint: 'Drop a trap behind you', icon: 'flame' },
  repair: { name: 'REPAIR KIT', hint: 'Restore your chariot', icon: 'mend' },
})
const _left = new THREE.Vector3()

/** Shared, non-solid supply chests. One held item per racer, five-second respawn. */
export class RacePickups {
  constructor(scene, track) {
    this.scene = scene
    this.time = 0
    this.boxes = []
    this.geometries = [new THREE.BoxGeometry(0.95, 0.7, 0.75), new THREE.BoxGeometry(0.12, 0.78, 0.82), new THREE.BoxGeometry(0.2, 0.24, 0.1)]
    this.materials = [woodMaterial('#88603b'), ironMaterial('#65656a'), bronzeMaterial('#b0793a')]
    for (const s of [0.1, 0.25, 0.4, 0.56, 0.72, 0.87]) {
      for (const lane of [-3, 0, 3]) {
        const group = new THREE.Group()
        const chest = new THREE.Mesh(this.geometries[0], this.materials[0])
        chest.castShadow = true
        group.add(chest)
        for (const x of [-0.32, 0.32]) {
          const strap = new THREE.Mesh(this.geometries[1], this.materials[1])
          strap.position.x = x; group.add(strap)
        }
        const latch = new THREE.Mesh(this.geometries[2], this.materials[2])
        latch.position.set(0, 0, 0.42); group.add(latch)
        track.posAt(s, group.position).addScaledVector(track.leftAt(s, _left), lane)
        group.position.y = 0.9
        scene.add(group)
        this.boxes.push({ group, cooldown: 0, phase: s * 10 + lane })
      }
    }
  }

  update(dt, karts, onCollect) {
    this.time += dt
    for (const box of this.boxes) {
      box.cooldown = Math.max(0, box.cooldown - dt)
      box.group.visible = box.cooldown === 0
      if (!box.group.visible) continue
      box.group.rotation.y += dt * 0.7
      box.group.position.y = 0.9 + Math.sin(this.time * 2 + box.phase) * 0.12
      for (const kart of karts) {
        if (kart.finished || kart.heldItem) continue
        const p = kart.group.position, b = box.group.position
        if ((p.x - b.x) ** 2 + (p.z - b.z) ** 2 > 1.55 ** 2) continue
        // Repairs only enter the pool when useful.
        const pool = kart.damage > 0.08 ? ['boost', 'bolt', 'slick', 'repair'] : ['boost', 'bolt', 'slick']
        kart.heldItem = pool[Math.floor(Math.random() * pool.length)]
        kart.itemWait = 0.8 + Math.random() * 1.2
        box.cooldown = 5
        box.group.visible = false
        onCollect(kart)
        break
      }
    }
  }

  dispose() {
    for (const box of this.boxes) this.scene.remove(box.group)
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
  }
}
