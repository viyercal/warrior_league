import * as THREE from 'three'
import { toonRamp, glowTexture } from '../core/assets.js'

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
