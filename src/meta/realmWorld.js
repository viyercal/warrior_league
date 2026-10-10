import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createHero } from '../art/characterFactory.js'
import { stoneMaterial, ironMaterial, bronzeMaterial, clothMaterial, fireMaterial } from '../art/materials.js'
import { sky } from '../art/sky.js'
import { glowTexture, cloudTexture } from '../core/assets.js'

// The realm is a single, grounded vista. Geometry is deterministic and repeated
// masonry is instanced; the only shadow map belongs to the setting sun.
export function buildRealmWorld(scene, appearance, engine) {
  const motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
  const root = new THREE.Group()
  root.name = 'realm-world'
  scene.add(root)
  scene.environment = engine?.envMap || null
  scene.fog = new THREE.FogExp2('#383d40', 0.012)
  let seed = 1147
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const stone = stoneMaterial('#77736a')
  const darkStone = stoneMaterial('#454843')
  const paleStone = stoneMaterial('#969184')
  const iron = ironMaterial('#424344')
  const bronze = bronzeMaterial('#887043')
  const cube = new RoundedBoxGeometry(1, 1, 1, 1, 0.045)
  const dummy = new THREE.Object3D()
  function mesh(geometry, material, x, y, z, sx = 1, sy = 1, sz = 1, cast = true) {
    const object = new THREE.Mesh(geometry, material)
    object.position.set(x, y, z)
    object.scale.set(sx, sy, sz)
    object.castShadow = cast
    object.receiveShadow = true
    root.add(object)
    return object
  }
  function masonry(rows, material = stone) {
    const blocks = new THREE.InstancedMesh(cube, material, rows.length)
    rows.forEach(([x, y, z, sx, sy, sz, angle = 0], i) => {
      dummy.position.set(x, y, z)
      dummy.rotation.set(0, 0, angle)
      dummy.scale.set(sx, sy, sz)
      dummy.updateMatrix()
      blocks.setMatrixAt(i, dummy.matrix)
      blocks.setColorAt(i, new THREE.Color().setScalar(0.78 + random() * 0.3))
    })
    blocks.castShadow = blocks.receiveShadow = true
    root.add(blocks)
    return blocks
  }

  const dome = sky({
    radius: 440, top: '#111923', mid: '#566064', bottom: '#ae9b79',
    haze: '#dfb677', hazeAmt: 0.16, hazeBand: 0.2,
    stars: 0.035, clouds: { color: '#8e9492', shade: '#323a42', amount: 0.3, scale: 1.6, speed: 0.11 },
  })
  root.add(dome)
  // Panoramic serrated ridgelines, with many peaks across the camera's field
  // of view. The old full-circle low-frequency profiles read as diagonal slabs.
  function mountainRange(depth, width, base, height, tint, peakCount) {
    const anchors = []
    for (let i = 0; i <= peakCount * 2; i++) {
      anchors.push(base + height * (i % 2 ? 0.5 + random() * 0.5 : 0.1 + random() * 0.25))
    }
    const positions = [], colors = []
    const high = new THREE.Color(tint)
    const low = high.clone().multiplyScalar(0.77)
    const steps = peakCount * 18
    for (let i = 0; i <= steps; i++) {
      const at = i / steps * peakCount * 2
      const k = Math.min(anchors.length - 2, Math.floor(at))
      const frac = at - k
      const y = THREE.MathUtils.lerp(anchors[k], anchors[k + 1], frac) + (random() - 0.5) * height * 0.06
      const x = (i / steps - 0.5) * width
      positions.push(x, -35, -depth, x, y, -depth)
      colors.push(low.r, low.g, low.b, high.r, high.g, high.b)
    }
    const indices = []
    for (let i = 0; i < steps; i++) {
      const b = i * 2
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide })))
  }
  mountainRange(265, 520, 5, 38, '#87908d', 29)
  mountainRange(196, 400, 0, 26, '#66767a', 25)
  mountainRange(132, 300, -4, 18, '#465b64', 21)

  // One silhouette mesh describes a distant walled city: slender watchtowers,
  // stepped keeps, crenellations and needle roofs emerge between the peaks.
  const citadelShapes = []
  const silhouetteRect = (x, y, w, h) => {
    const shape = new THREE.Shape()
    shape.moveTo(x, y); shape.lineTo(x + w, y); shape.lineTo(x + w, y + h)
    shape.lineTo(x, y + h); shape.closePath()
    citadelShapes.push(shape)
  }
  for (let i = 0; i < 30; i++) {
    const x = -55 + i * 4.1
    const ground = -1 + Math.sin(i * 0.43) * 2.0
    const h = 3 + random() * 4.8
    const w = 1.1 + random() * 1.5
    silhouetteRect(x, -20, w, h + ground + 20)
    silhouetteRect(x - 0.25, ground + h - 0.55, w + 0.5, 0.55)
    for (let tooth = 0; tooth < 3; tooth++) silhouetteRect(x - 0.2 + tooth * (w + 0.15) / 3, ground + h, 0.35, 0.55)
    if (i % 4 === 0) {
      const roof = new THREE.Shape()
      roof.moveTo(x - 0.15, ground + h + 0.2)
      roof.lineTo(x + w / 2, ground + h + 3.3)
      roof.lineTo(x + w + 0.15, ground + h + 0.2)
      roof.closePath(); citadelShapes.push(roof)
    }
    silhouetteRect(x + w, -20, 4.1 - w, 21 + ground)
  }
  const distantCity = new THREE.Mesh(new THREE.ShapeGeometry(citadelShapes), new THREE.MeshBasicMaterial({ color: '#344952', fog: false }))
  distantCity.position.z = -88
  root.add(distantCity)

  // An actual occluding disc gives the eclipse a sharp silhouette; a soft
  // corona sits behind it, with no full-screen transparency or volumetric pass.
  const eclipse = new THREE.Group()
  // Keep the celestial body behind every ridge, while preserving its framing.
  eclipse.position.set(62.3, 55.6, -330)
  eclipse.scale.setScalar(2.6)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: '#f1c88a', transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }))
  halo.scale.set(47, 47, 1)
  // Sprite billboarding tilts the halo plane. A depth gap prevents that plane
  // from intersecting the moon and brightening exactly half of its surface.
  halo.position.z = -8
  eclipse.add(halo)
  const corona = new THREE.Mesh(new THREE.RingGeometry(7.13, 7.36, 128), new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffdaa0').multiplyScalar(2.1), fog: false, toneMapped: false,
  }))
  eclipse.add(corona)
  const lunarDisc = new THREE.Mesh(new THREE.CircleGeometry(7.13, 128), new THREE.MeshBasicMaterial({ color: '#222a30', fog: false }))
  lunarDisc.position.z = 0.02
  eclipse.add(lunarDisc)
  root.add(eclipse)

  const hemi = new THREE.HemisphereLight('#a9bdcf', '#342d23', 1.45)
  const sun = new THREE.DirectionalLight('#f2d1a0', 3.5)
  sun.position.set(10, 16, -9)
  sun.target.position.set(3, 1, 0)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 19, bottom: -14, near: 0.5, far: 65 })
  sun.shadow.bias = -0.00025
  sun.shadow.normalBias = 0.035
  const portrait = new THREE.DirectionalLight('#b9cbdc', 2.35)
  portrait.position.set(-4, 7, 10)
  const warmFill = new THREE.PointLight('#f7b363', 30, 14, 2)
  warmFill.position.set(6, 2.5, 5)
  root.add(hemi, sun, sun.target, portrait, warmFill)

  // Broad, irregular flagstone terrace and a raised champion's dais.
  mesh(cube, darkStone, 0, -0.8, -5, 65, 1, 60, false)
  const flags = []
  for (let row = 0; row < 14; row++) {
    for (let col = 0; col < 16; col++) {
      flags.push([(col - 8) * 2.03 + (row % 2) * 0.98, -0.27 + random() * 0.03,
        10 - row * 2.03, 1.99, 0.25, 1.99])
    }
  }
  masonry(flags, darkStone)
  const daisGeo = new THREE.CylinderGeometry(1, 1, 1, 64)
  mesh(daisGeo, darkStone, 3.35, -0.04, 2.2, 3.4, 0.35, 3.4)
  mesh(daisGeo, stone, 3.35, 0.15, 2.2, 3.15, 0.14, 3.15)
  mesh(daisGeo, paleStone, 3.35, 0.26, 2.2, 2.87, 0.1, 2.87)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.73, 0.018, 4, 100), bronze)
  rim.rotation.x = Math.PI / 2
  rim.position.set(3.35, 0.32, 2.2)
  root.add(rim)
  // Thin inlaid stone joints lend scale without dozens of tiny draw calls.
  const seams = []
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8
    const r = 2.65
    seams.push(3.35 + Math.cos(a) * 1.3, 0.317, 2.2 + Math.sin(a) * 1.3,
      3.35 + Math.cos(a) * r, 0.317, 2.2 + Math.sin(a) * r)
  }
  const seamGeo = new THREE.BufferGeometry()
  seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seams, 3))
  root.add(new THREE.LineSegments(seamGeo, new THREE.LineBasicMaterial({ color: '#393b36', transparent: true, opacity: 0.65 })))
  masonry([
    [3.35, -0.1, 5.5, 5.2, 0.2, 0.9],
    [3.35, -0.2, 6.1, 5.9, 0.18, 0.9],
  ])

  // The broken triumphal gate, built from individually jointed voussoirs.
  const gateX = 7.2, gateZ = -15.5, spring = 7.0, archRadius = 4.8
  const blocks = []
  for (const side of [-1, 1]) {
    const x = gateX + side * archRadius
    blocks.push([x, 0.25, gateZ, 2.65, 0.9, 3.1], [x, 0.88, gateZ, 2.2, 0.35, 2.7])
    for (let level = 0; level < 8; level++) {
      blocks.push([x + (random() - 0.5) * 0.05, 1.45 + level * 0.73, gateZ, 1.76, 0.7, 2.15])
      blocks.push([x, 1.43 + level * 0.73, gateZ + 1.15, 0.92, 0.7, 0.34])
    }
    blocks.push([x, spring - 0.03, gateZ, 2.3, 0.4, 2.8])
    // Paired buttresses and outer ruined walls anchor the gate in the ground.
    blocks.push([x + side * 1.45, 2.45, gateZ - 0.7, 1.0, 5.1, 3.6])
    for (let j = 0; j < 5; j++) {
      const h = 4.3 - j * 0.53 + random()
      blocks.push([x + side * (2.4 + j * 1.7), h / 2, gateZ - 1.5, 1.63, h, 1.8])
    }
  }
  for (let i = 0; i < 21; i++) {
    const a = (i + 0.5) * Math.PI / 21
    blocks.push([gateX + Math.cos(a) * archRadius, spring + Math.sin(a) * archRadius,
      gateZ, 0.71, 1.4, 2.2, a - Math.PI / 2])
  }
  masonry(blocks)
  mesh(cube, paleStone, gateX, spring + archRadius, gateZ + 0.06, 0.9, 1.75, 2.6)
  const ridgeBlocks = []
  for (let i = 0; i < 12; i++) {
    const x = -16 + i * 1.27
    const h = 1.0 + random() * 1.5
    ridgeBlocks.push([x, h / 2 - 0.5, -16 - random() * 1.5, 1.17, h, 1.6])
  }
  masonry(ridgeBlocks, darkStone)

  // Two braziers add physically plausible pools of gold to the cold stone.
  const flameMat = fireMaterial({ intensity: 1.65, speed: 0.65, edgeColor: '#b94d20', midColor: '#e99035', coreColor: '#ffe0a0' })
  const flameGeo = new THREE.ConeGeometry(0.28, 1.05, 12, 4, true)
  const flames = []
  for (const [x, z] of [[0.0, -2.8], [8.4, -2.8]]) {
    mesh(daisGeo, darkStone, x, 0.26, z, 0.52, 0.8, 0.52)
    mesh(daisGeo, iron, x, 0.94, z, 0.18, 0.72, 0.18)
    mesh(new THREE.CylinderGeometry(0.54, 0.23, 0.28, 16), bronze, x, 1.36, z)
    flames.push(mesh(flameGeo, flameMat, x, 1.95, z, 1, 1, 1, false))
    const light = new THREE.PointLight('#ffb05b', 16, 10, 2)
    light.position.set(x, 1.95, z)
    root.add(light)
  }

  // A weathered standard, shaped in CPU vertices only once per frame.
  const clothGeo = new THREE.PlaneGeometry(1.45, 4.1, 6, 14)
  const clothPos = clothGeo.attributes.position
  for (let i = 0; i < clothPos.count; i++) {
    const y = clothPos.getY(i)
    if (y < -1.7) clothPos.setY(i, y + random() * 0.35)
  }
  const clothBase = clothPos.array.slice()
  const banner = mesh(clothGeo, clothMaterial('#39272a'), 11.65, 4.3, -9, 1, 1, 1, false)
  mesh(new THREE.CylinderGeometry(0.045, 0.075, 7.6, 10), iron, 10.88, 3.5, -9)
  mesh(cube, bronze, 11.6, 6.37, -9, 1.75, 0.055, 0.055)

  // Fractured limestone scree: one draw call for 90 imperfect rocks.
  const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), darkStone, 90)
  for (let i = 0; i < 90; i++) {
    const side = random() < 0.5 ? -1 : 1
    const x = 7.2 + side * (5.5 + random() * 8)
    const z = -8 - random() * 16
    const size = 0.14 + random() * 0.58
    dummy.position.set(x, size * 0.25 - 0.1, z)
    dummy.rotation.set(random(), random() * 6.28, random())
    dummy.scale.set(size, size * 0.7, size * (0.7 + random()))
    dummy.updateMatrix()
    rubble.setMatrixAt(i, dummy.matrix)
  }
  rubble.castShadow = rubble.receiveShadow = true
  root.add(rubble)

  const hero = createHero(appearance, { auraRing: false })
  hero.group.position.set(3.35, 0.32, 2.2)
  hero.group.scale.setScalar(1.95)
  hero.group.rotation.y = -0.24
  for (const material of [hero.mats.bronze, hero.mats.bronzeDark, hero.mats.iron]) {
    material.roughness = 0.63
    material.envMapIntensity = 0.55
  }
  hero.mats.glow.color.multiplyScalar(0.58)
  root.add(hero.group)

  const mist = []
  const mistMap = cloudTexture()
  const mistMaterial = new THREE.SpriteMaterial({ map: mistMap, color: '#a5aca8', transparent: true, opacity: 0.12, depthWrite: false })
  for (let i = 0; i < 7; i++) {
    const sprite = new THREE.Sprite(mistMaterial)
    sprite.position.set(-22 + i * 8, 0.7 + random(), -12 - random() * 9)
    sprite.scale.set(16 + random() * 8, 2.1 + random() * 2, 1)
    sprite.userData.baseX = sprite.position.x
    root.add(sprite)
    mist.push(sprite)
  }
  const motesGeo = new THREE.BufferGeometry()
  const motesPos = new Float32Array(90 * 3)
  for (let i = 0; i < 90; i++) motesPos.set([-10 + random() * 24, 0.3 + random() * 9, -9 + random() * 16], i * 3)
  motesGeo.setAttribute('position', new THREE.BufferAttribute(motesPos, 3))
  const motes = new THREE.Points(motesGeo, new THREE.PointsMaterial({
    map: glowTexture(), size: 0.045, color: '#d0b088', transparent: true, opacity: 0.65,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }))
  root.add(motes)

  const realmColors = {
    duel: ['#383d40', '#f2d1a0', '#566064'], moba: ['#38413f', '#d9d0a4', '#536561'],
    hoops: ['#423b38', '#f0c396', '#675e57'], arena: ['#3c383c', '#e0b394', '#62585c'],
    kart: ['#42403a', '#f2d6a6', '#66665d'], brawl: ['#3d3c40', '#c8c6d9', '#5b606b'],
    siege: ['#403a36', '#efbb8c', '#655a50'],
  }
  const fogTarget = scene.fog.color.clone()
  const sunTarget = sun.color.clone()
  const skyTarget = dome.material.uniforms.uMid.value.clone()
  let elapsed = 0
  return {
    hero,
    setRealm(game) {
      const colors = realmColors[typeof game === 'string' ? game : game?.key || game?.id] || realmColors.duel
      fogTarget.set(colors[0]); sunTarget.set(colors[1]); skyTarget.set(colors[2])
    },
    update(dt) {
      const fade = 1 - Math.exp(-dt * 1.8)
      scene.fog.color.lerp(fogTarget, fade)
      sun.color.lerp(sunTarget, fade)
      dome.material.uniforms.uMid.value.lerp(skyTarget, fade)
      // Own these two clocks so the preference also works when changed live.
      dome.material.uniforms.uTime.value = elapsed
      flameMat.uniforms.uTime.value = elapsed
      if (engine?.reducedMotion ?? motionPreference?.matches ?? false) return
      elapsed += dt
      hero.update(dt * 0.65)
      for (let i = 0; i < mist.length; i++) mist[i].position.x = mist[i].userData.baseX + Math.sin(elapsed * 0.025 + i) * 2
      for (let i = 0; i < flames.length; i++) flames[i].scale.y = 0.95 + Math.sin(elapsed * 5.1 + i) * 0.06
      for (let i = 0; i < clothPos.count; i++) {
        const index = i * 3
        const hang = (2.05 - clothBase[index + 1]) / 4.1
        clothPos.array[index + 2] = Math.sin(clothBase[index] * 2.4 + elapsed * 1.35 + hang * 2.2) * 0.17 * hang
      }
      clothPos.needsUpdate = true
      // Soft, broad waves need no per-frame normal recalculation.
      for (let i = 0; i < motesPos.length; i += 3) {
        motesPos[i] += dt * 0.075
        motesPos[i + 1] += dt * (0.04 + (i % 7) * 0.011)
        if (motesPos[i + 1] > 9.5) motesPos[i + 1] = 0.25
        if (motesPos[i] > 14) motesPos[i] = -10
      }
      motesGeo.attributes.position.needsUpdate = true
    },
    // Shared teardown owns geometry, maps, instance buffers, and light shadows.
    dispose() {},
  }
}
