import * as THREE from 'three'
import { skyDome, starField, groundDisc, crystal, fireflies } from '../art/environment.js'
import { createHero } from '../art/characterFactory.js'
import { VFX } from '../art/vfx.js'
import { HUD } from '../ui/hud.js'

/**
 * Temporary placeholder scene factory — proves the shared pipeline renders.
 * Each real scene module replaces its stub entirely.
 */
export function stubScene(title, theme = 'hub') {
  return class StubScene {
    constructor(ctx) { this.ctx = ctx }

    async init() {
      const { engine, profile, audio } = this.ctx
      this.scene = new THREE.Scene()
      this.scene.fog = new THREE.Fog('#1a2246', 60, 200)
      this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 600)
      this.camera.position.set(0, 3.2, 8)
      this.camera.lookAt(0, 1.4, 0)

      this.scene.add(skyDome({ sunDir: new THREE.Vector3(0.5, 0.3, -0.6) }))
      this.stars = starField()
      this.scene.add(this.stars)
      this.scene.add(groundDisc({ radius: 60, texOpts: { base: '#2b3560', blotches: ['#394680', '#232b52', '#41528f'] } }))
      this.scene.environment = engine.envMap

      this.scene.add(new THREE.HemisphereLight('#8fb4ff', '#2a2244', 0.85))
      const sun = new THREE.DirectionalLight('#ffe0b8', 2.2)
      sun.position.set(14, 20, 8)
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      sun.shadow.camera.left = sun.shadow.camera.bottom = -20
      sun.shadow.camera.right = sun.shadow.camera.top = 20
      this.scene.add(sun)

      this.crystals = []
      for (const [x, z] of [[-6, -4], [6, -5], [-8, 3], [8, 4]]) {
        const c = crystal({ height: 2.6 })
        c.position.set(x, 0, z)
        this.scene.add(c)
        this.crystals.push(c)
      }
      this.flies = fireflies({ count: 30, area: [40, 40] })
      this.scene.add(this.flies)

      this.hero = createHero(profile.appearance, { auraRing: true })
      this.scene.add(this.hero.group)
      this.vfx = new VFX(this.scene)

      this.hud = new HUD()
      this.hud.banner(title, { sub: 'MODULE UNDER CONSTRUCTION — ESC FOR HUB', duration: 0 })
      audio.music(theme)
    }

    update(dt, t) {
      this.hero.update(dt)
      this.hero.setState(Math.sin(t * 0.3) > 0 ? 'normal' : 'dance')
      for (const c of this.crystals) c.tick(dt)
      this.flies.tick(dt)
      this.stars.rotation.y += dt * 0.004
      this.camera.position.x = Math.sin(t * 0.12) * 1.4
      this.camera.lookAt(0, 1.3, 0)
      this.vfx.update(dt)
    }

    dispose() { this.vfx.dispose() }
  }
}
