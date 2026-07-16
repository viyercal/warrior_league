import * as THREE from 'three'
import { starTexture, cloudTexture, groundTexture, glowTexture } from '../core/assets.js'
import { toonMaterial, energyMaterial } from './materials.js'
import { rand, TAU } from '../core/utils.js'

/**
 * Gradient sky dome with optional sun glow.
 * opts: { top, mid, bottom, radius, sunDir:Vector3, sunColor, sunSize }
 */
export function skyDome({
  top = '#12224e', mid = '#41539b', bottom = '#e8935c', radius = 480,
  sunDir = null, sunColor = '#ffd9a0', sunSize = 90,
} = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uMid: { value: new THREE.Color(mid) },
      uBottom: { value: new THREE.Color(bottom) },
      uSunDir: { value: (sunDir || new THREE.Vector3(0.4, 0.25, -0.6)).clone().normalize() },
      uSunColor: { value: new THREE.Color(sunColor) },
      uSunSize: { value: sunSize },
      uSunOn: { value: sunDir ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWp;
      void main() {
        vWp = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uBottom, uSunColor, uSunDir;
      uniform float uSunSize, uSunOn;
      varying vec3 vWp;
      void main() {
        vec3 d = normalize(vWp);
        float h = d.y;
        vec3 col = mix(uBottom, uMid, smoothstep(-0.08, 0.22, h));
        col = mix(col, uTop, smoothstep(0.22, 0.75, h));
        col += uMid * 0.22 * pow(1.0 - abs(h), 3.0);
        col += uSunOn * uSunColor * pow(max(dot(d, uSunDir), 0.0), uSunSize) * 1.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), mat)
  mesh.frustumCulled = false
  return mesh
}

/** Twinkly starfield dome (pixels-sized points, additive). */
export function starField({ count = 700, radius = 430, size = 2.4, color = '#ffffff' } = {}) {
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const a = rand(TAU), y = rand(0.04, 1)
    const r = Math.sqrt(1 - y * y) * radius
    pos.set([Math.cos(a) * r, y * radius, Math.sin(a) * r], i * 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    map: starTexture(), color, size, sizeAttenuation: false,
    transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  return new THREE.Points(geo, mat)
}

/** Drifting billboard cloud layer. Call group.tick(dt) each frame. */
export function cloudLayer({ count = 10, radius = 240, height = [45, 100], color = '#ffffff', opacity = 0.5, scale = [55, 110] } = {}) {
  const group = new THREE.Group()
  const tex = cloudTexture()
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: rand(opacity * 0.5, opacity), depthWrite: false })
    const s = new THREE.Sprite(mat)
    const a = rand(TAU), r = rand(radius * 0.5, radius)
    s.position.set(Math.cos(a) * r, rand(height[0], height[1]), Math.sin(a) * r)
    const sc = rand(scale[0], scale[1])
    s.scale.set(sc, sc * 0.42, 1)
    group.add(s)
  }
  group.tick = dt => { group.rotation.y += dt * 0.0045 }
  return group
}

/** Painterly ground disc, shadow-receiving. */
export function groundDisc({ radius = 70, repeat = 5, roughness = 0.95, texOpts = {} } = {}) {
  const tex = groundTexture(texOpts)
  tex.repeat.set(repeat, repeat)
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 56),
    new THREE.MeshStandardMaterial({ map: tex, roughness, metalness: 0 }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  return mesh
}

/** Floating animated energy crystal. Call group.tick(dt) each frame. */
export function crystal({ color1 = '#0b3f66', color2 = '#54e0ff', height = 2.4 } = {}) {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(height * 0.3, 0),
    energyMaterial({ color1, color2 }),
  )
  mesh.scale.y = 1.9
  mesh.position.y = height * 0.62
  mesh.castShadow = true
  group.add(mesh)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: color2, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  halo.scale.setScalar(height * 1.5)
  halo.position.y = height * 0.62
  group.add(halo)
  let t = rand(10)
  group.tick = dt => {
    t += dt
    mesh.rotation.y += dt * 0.6
    mesh.position.y = height * 0.62 + Math.sin(t * 1.4) * height * 0.06
    halo.position.y = mesh.position.y
  }
  return group
}

/** Stylized tree: cone trunk + stacked leaf blobs. */
export function tree({ trunk = '#6b4a36', leaves = '#2f8f4f', scale = 1 } = {}) {
  const g = new THREE.Group()
  const tm = toonMaterial({ color: trunk, rimStrength: 0.15 })
  const lm = toonMaterial({ color: leaves, rimStrength: 0.3, rim: '#d8ffd0' })
  const trunkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.1, 7), tm)
  trunkMesh.position.y = 0.55
  g.add(trunkMesh)
  const blobs = [[0, 1.5, 0, 0.85], [0.35, 1.9, 0.1, 0.6], [-0.3, 2.05, -0.12, 0.5], [0, 2.4, 0, 0.42]]
  for (const [x, y, z, r] of blobs) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), lm)
    m.position.set(x, y, z)
    m.castShadow = true
    g.add(m)
  }
  trunkMesh.castShadow = true
  g.scale.setScalar(scale * rand(0.85, 1.2))
  g.rotation.y = rand(TAU)
  return g
}

/** Low-poly jittered rock. */
export function rock({ color = '#8b93a7', scale = 1 } = {}) {
  const geo = new THREE.IcosahedronGeometry(0.55, 0)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * rand(0.8, 1.25), p.getY(i) * rand(0.6, 1.1), p.getZ(i) * rand(0.8, 1.25))
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, toonMaterial({ color, flatShading: true, rimStrength: 0.18 }))
  m.scale.setScalar(scale)
  m.position.y = 0.3 * scale
  m.rotation.y = rand(TAU)
  m.castShadow = true
  return m
}

/** Fake-volumetric god ray cone (additive, apex at top). */
export function lightShaft({ color = '#ffe9b0', height = 30, radius = 6, opacity = 0.045 } = {}) {
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  )
  mesh.position.y = height / 2
  return mesh
}

/** Wandering glow motes / fireflies. Call points.tick(dt) each frame. */
export function fireflies({ count = 40, area = [60, 60], height = [0.5, 5], color = '#ffe27a', size = 0.5 } = {}) {
  const base = new Float32Array(count * 3)
  const phase = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    base.set([rand(-area[0] / 2, area[0] / 2), rand(height[0], height[1]), rand(-area[1] / 2, area[1] / 2)], i * 3)
    phase[i] = rand(TAU)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3))
  const mat = new THREE.PointsMaterial({
    map: glowTexture(), color, size, transparent: true, opacity: 0.85,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const pts = new THREE.Points(geo, mat)
  let t = 0
  pts.tick = dt => {
    t += dt
    const p = pts.geometry.attributes.position
    for (let i = 0; i < count; i++) {
      p.setXYZ(i,
        base[i * 3] + Math.sin(t * 0.7 + phase[i]) * 1.6,
        base[i * 3 + 1] + Math.sin(t * 1.1 + phase[i] * 2) * 0.8,
        base[i * 3 + 2] + Math.cos(t * 0.5 + phase[i]) * 1.6,
      )
    }
    p.needsUpdate = true
    mat.opacity = 0.6 + 0.3 * Math.sin(t * 2.2)
  }
  return pts
}
