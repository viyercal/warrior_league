import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js'

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.5 },
    uGrain: { value: 0.028 },
    uSat: { value: 1.07 },
    uExposure: { value: 1 },
    uContrast: { value: 1.03 },
    uAberr: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uSat, uExposure, uContrast, uAberr;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      // chromatic aberration: radial fringing, strongest at frame edges.
      // uAberr is engine-driven (hit pulses) — rest state is 0.
      vec2 dir = vUv - vec2(0.5);
      vec2 off = dir * dot(dir, dir) * uAberr;
      vec4 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;
      c.a = 1.0;
      c.rgb *= uExposure; // pre-tonemap (OutputPass tonemaps last)
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - uVignette * smoothstep(0.38, 0.92, d);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb += (hash(vUv * vec2(1917.0, 1031.0) + fract(uTime) * 61.0) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
}

/**
 * Cinematic post chain: MSAA render [-> SAO] -> bloom -> color grade -> tonemapped output.
 * opts: { bloom, bloomThreshold, bloomRadius, vignette, grain, saturation, contrast,
 *         aberration (rest-state CA, usually 0 — use engine.aberrPulse for hits),
 *         ssao (default false), ssaoIntensity, exposure (pre-tonemap, default 1) }
 * Defaults are byte-identical to the pre-realism chain when opts are absent.
 */
export function buildComposer(renderer, scene, camera, opts = {}) {
  const {
    bloom = 0.7, bloomThreshold = 0.82, bloomRadius = 0.5,
    vignette = 0.5, grain = 0.028, saturation = 1.07, contrast = 1.03,
    aberration = 0,
    ssao = false, ssaoIntensity = 0.05, exposure = 1,
  } = opts
  const size = renderer.getSize(new THREE.Vector2())
  const pr = renderer.getPixelRatio()
  // Perf: at pixelRatio 2 the supersampled density already antialiases —
  // full 4x MSAA on a half-float target doubles fill cost for no visible gain.
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
    samples: pr >= 2 ? 2 : 4,
    type: THREE.HalfFloatType,
  })
  const composer = new EffectComposer(renderer, rt)
  composer.setPixelRatio(pr)
  composer.setSize(size.x, size.y)

  composer.addPass(new RenderPass(scene, camera))

  if (ssao) {
    // Cheap SAO: small kernel + light blur, multiplied onto the beauty pass
    const sao = new SAOPass(scene, camera, new THREE.Vector2(size.x, size.y))
    Object.assign(sao.params, {
      saoBias: 0.5,
      saoIntensity: ssaoIntensity,
      saoScale: 10,
      saoKernelRadius: 16,
      saoMinResolution: 0,
      saoBlur: true,
      saoBlurRadius: 6,
      saoBlurStdDev: 3,
      saoBlurDepthCutoff: 0.01,
    })
    composer.addPass(sao)
    composer.saoPass = sao
  }

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), bloom, bloomRadius, bloomThreshold)
  composer.addPass(bloomPass)

  const grade = new ShaderPass(GradeShader)
  grade.uniforms.uVignette.value = vignette
  grade.uniforms.uGrain.value = grain
  grade.uniforms.uSat.value = saturation
  grade.uniforms.uExposure.value = exposure
  grade.uniforms.uContrast.value = contrast
  grade.uniforms.uAberr.value = aberration
  composer.addPass(grade)

  composer.addPass(new OutputPass())

  composer.bloomPass = bloomPass
  composer.gradePass = grade
  return composer
}
