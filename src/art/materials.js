import * as THREE from 'three'
import {
  toonRamp, glowTexture, canvasTexture,
  crackedStoneTexture, woodPlankTexture, packedEarthTexture, wornMetalTexture, fabricGrainTexture,
} from '../core/assets.js'

const _animated = new Set()

/** Advance all time-driven materials. Wired once in main.js via engine.addTicker. */
export function tickMaterials(dt) {
  for (const m of _animated) m.uniforms.uTime.value += dt
}

function track(mat) {
  _animated.add(mat)
  const d = mat.dispose.bind(mat)
  mat.dispose = () => { _animated.delete(mat); d() }
  return mat
}

/**
 * Stylized cel material: stepped toon ramp + fresnel rim light.
 * The LoL/Overwatch look — use for characters and hero props.
 */
export function toonMaterial({
  color = '#ffffff', steps = 3, rim = '#cfe9ff', rimStrength = 0.42, rimPower = 3,
  emissive = '#000000', emissiveIntensity = 1, map = null,
  transparent = false, opacity = 1, flatShading = false, side = THREE.FrontSide,
} = {}) {
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: toonRamp(steps), map, emissive, emissiveIntensity,
    transparent, opacity, side,
  })
  m.flatShading = flatShading
  const u = {
    uRimColor: { value: new THREE.Color(rim) },
    uRimStrength: { value: rimStrength },
    uRimPower: { value: rimPower },
  }
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        vec3 iplViewDir = normalize(vViewPosition);
        float iplFres = pow(clamp(1.0 - dot(normalize(vNormal), iplViewDir), 0.0, 1.0), uRimPower);
        gl_FragColor.rgb += uRimColor * iplFres * uRimStrength;`)
  }
  m.customProgramCacheKey = () => 'ipl-toon-rim'
  m.userData.rim = u
  return m
}

/** Unlit HDR glow — color pushed past 1.0 so it blooms. For gems, visors, trims. */
export function glowMaterial(color = '#7df9ff', intensity = 2.4) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) })
}

/** Additive soft glow sprite material (halo / aura). */
export function glowSpriteMaterial(color = '#7df9ff', opacity = 0.8) {
  return new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
}

/** Animated plasma/energy shader — nexus crystals, cores, portals. HDR output feeds bloom. */
export function energyMaterial({ color1 = '#0b3f66', color2 = '#54e0ff', speed = 1, intensity = 1.15 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uC1: { value: new THREE.Color(color1) },
      uC2: { value: new THREE.Color(color2) },
      uSpeed: { value: speed },
      uIntensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vWp; varying vec3 vVp;
      void main() {
        vN = normalMatrix * normal;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWp = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vVp = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSpeed, uIntensity;
      uniform vec3 uC1, uC2;
      varying vec3 vN; varying vec3 vWp; varying vec3 vVp;
      void main() {
        float band = 0.5 + 0.5 * sin(vWp.y * 4.0 - uTime * uSpeed * 3.0);
        band *= 0.5 + 0.5 * sin(vWp.x * 3.0 + vWp.z * 2.6 + uTime * uSpeed * 2.0);
        vec3 col = mix(uC1, uC2, band);
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vVp))), 2.0);
        col += uC2 * fres * 1.6;
        gl_FragColor = vec4(col * uIntensity, 1.0);
      }`,
  })
  return track(m)
}

// ============================================================================
// REALISM KIT — PBR materials for game scenes. Texture sets are generated
// once and SHARED across every preset call (module cache below); materials
// themselves are fresh per call so tints/emissive pokes never cross-contaminate.
// ============================================================================

const _texSets = new Map()
const texSet = (key, make) => {
  if (!_texSets.has(key)) _texSets.set(key, make())
  return _texSets.get(key)
}

/**
 * MeshStandardMaterial wrapper with realism-kit defaults.
 * opts: { color (albedo tint), roughness, metalness, maps: {map, normalMap,
 * roughnessMap}, normalScale, envMapIntensity, emissive, emissiveIntensity,
 * transparent, opacity, side, flatShading }
 * NOTE: effective roughness = roughness × roughnessMap sample.
 */
export function pbrMaterial({
  color = '#ffffff', roughness = 0.85, metalness = 0,
  maps = null, normalScale = 1, envMapIntensity = 0.55,
  emissive = '#000000', emissiveIntensity = 1,
  transparent = false, opacity = 1, side = THREE.FrontSide, flatShading = false,
} = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness, metalness, emissive, emissiveIntensity,
    transparent, opacity, side,
    map: maps?.map || null,
    normalMap: maps?.normalMap || null,
    roughnessMap: maps?.roughnessMap || null,
  })
  if (maps?.normalMap) m.normalScale.setScalar(normalScale)
  m.envMapIntensity = envMapIntensity
  m.flatShading = flatShading
  return m
}

// --- presets (tint param = albedo color; texture sets shared via cache) ---
// wornMetal roughnessMap averages ≈0.8 → material.roughness 0.68/0.45 lands at
// the target effective ≈0.55 (worn iron) / ≈0.36 (polished bronze).

export const stoneMaterial = (tint = '#ffffff') => pbrMaterial({
  color: tint, roughness: 1.0, metalness: 0,
  maps: texSet('stone', crackedStoneTexture), normalScale: 1.0, envMapIntensity: 0.3,
})

export const ironMaterial = (tint = '#6b6f78') => pbrMaterial({
  color: tint, roughness: 0.68, metalness: 0.9,
  maps: texSet('metal', wornMetalTexture), normalScale: 0.9, envMapIntensity: 0.85,
})

export const bronzeMaterial = (tint = '#b0793a') => pbrMaterial({
  color: tint, roughness: 0.52, metalness: 1.0,
  maps: texSet('metal', wornMetalTexture), normalScale: 0.9, envMapIntensity: 1.0,
})

export const leatherMaterial = (tint = '#4a352a') => pbrMaterial({
  color: tint, roughness: 0.95, metalness: 0,
  maps: texSet('grain', () => fabricGrainTexture({ scale: 44, contrast: 0.22, lum: 0.92 })),
  normalScale: 1.1, envMapIntensity: 0.35,
})

export const woodMaterial = (tint = '#ffffff') => pbrMaterial({
  color: tint, roughness: 0.9, metalness: 0,
  maps: texSet('wood', woodPlankTexture), normalScale: 0.9, envMapIntensity: 0.25,
})

export const earthMaterial = (tint = '#ffffff') => pbrMaterial({
  color: tint, roughness: 1.0, metalness: 0,
  maps: texSet('earth', packedEarthTexture), normalScale: 1.0, envMapIntensity: 0.2,
})

export const boneMaterial = (tint = '#e8dcc4') => pbrMaterial({
  color: tint, roughness: 0.62, metalness: 0,
  maps: texSet('grain', () => fabricGrainTexture({ scale: 34 })), normalScale: 0.4, envMapIntensity: 0.5,
})

export const clothMaterial = (color = '#5a4636') => pbrMaterial({
  color, roughness: 1.0, metalness: 0,
  maps: texSet('weave', () => fabricGrainTexture({ scale: 90, contrast: 0.22, rough: 0.98, roughVar: 0.04 })),
  normalScale: 0.8, envMapIntensity: 0.25, side: THREE.DoubleSide,
})

/**
 * Layered animated fire — blackbody ramp (deep red edge → orange → near-white
 * hot core rising from the base), HDR output feeds bloom. Apply to cones/planes
 * with v=0 at the flame base. Auto-ticked via tickMaterials.
 */
export function fireMaterial({ intensity = 2.4, speed = 1.5, edgeColor = '#b32410', midColor = '#ff8c2e', coreColor = '#fff2c4' } = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uIntensity: { value: intensity },
      uEdge: { value: new THREE.Color(edgeColor) },
      uMid: { value: new THREE.Color(midColor) },
      uCore: { value: new THREE.Color(coreColor) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSpeed, uIntensity;
      uniform vec3 uEdge, uMid, uCore;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      void main() {
        float t = uTime * uSpeed;
        // rising turbulence, finer near the tip
        float n = vnoise(vec2(vUv.x * 5.0, vUv.y * 4.0 - t * 2.2)) * 0.65
                + vnoise(vec2(vUv.x * 11.0, vUv.y * 9.0 - t * 3.6)) * 0.35;
        // heat: hottest at base + core axis, eaten away by noise toward the tip
        float heat = (1.0 - vUv.y) * 1.15 - n * (0.35 + vUv.y * 0.8);
        heat += (0.5 - abs(vUv.x - 0.5)) * 0.55;
        heat = clamp(heat, 0.0, 1.0);
        vec3 col = mix(uEdge, uMid, smoothstep(0.15, 0.55, heat));
        col = mix(col, uCore, smoothstep(0.62, 0.95, heat));
        float alpha = smoothstep(0.06, 0.35, heat);
        gl_FragColor = vec4(col * uIntensity * (0.4 + heat), alpha);
      }`,
  })
  return track(m)
}

/**
 * The ONLY legitimately emissive accent material (rune slits, eyes, embers).
 * Warm, just above bloom threshold — reads as embers, not LEDs.
 */
export function emberGlowMaterial(intensity = 1.5, color = '#ff8c3b') {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) })
}

let _blobTex = null
let _blobGeo = null
/**
 * Soft dark contact-shadow disc for grounding characters/props.
 * Returns a mesh already rotated flat, y = 0.02 — add to the object's group.
 */
export function contactShadow(radius = 0.5, opacity = 0.4) {
  if (!_blobTex) {
    _blobTex = canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
      g.addColorStop(0, 'rgba(0,0,0,0.92)')
      g.addColorStop(0.55, 'rgba(0,0,0,0.5)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    })
  }
  _blobGeo ??= new THREE.CircleGeometry(1, 28)
  const m = new THREE.Mesh(_blobGeo, new THREE.MeshBasicMaterial({
    map: _blobTex, transparent: true, opacity, depthWrite: false,
  }))
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.02
  m.scale.setScalar(radius)
  m.renderOrder = 1
  return m
}

/** Animated stylized water plane (rivers, pools). */
export function waterMaterial({ shallow = '#3fd4c9', deep = '#155d8a', opacity = 0.88, speed = 1 } = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(shallow) },
      uDeep: { value: new THREE.Color(deep) },
      uOpacity: { value: opacity },
      uSpeed: { value: speed },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWp;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWp = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity, uSpeed;
      uniform vec3 uShallow, uDeep;
      varying vec3 vWp;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        float t = uTime * uSpeed;
        float w = sin(vWp.x * 0.9 + t * 1.3) * 0.5 + sin(vWp.z * 1.2 - t * 0.9) * 0.5;
        w += sin((vWp.x + vWp.z) * 0.4 + t * 0.6);
        vec3 col = mix(uDeep, uShallow, 0.45 + 0.25 * w);
        float sp = step(0.986, hash(floor(vWp.xz * 3.0) + floor(t * 2.0)));
        col += sp * vec3(1.4);
        gl_FragColor = vec4(col, uOpacity);
      }`,
  })
  return track(m)
}
