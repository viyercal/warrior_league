import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.5 },
    uGrain: { value: 0.028 },
    uSat: { value: 1.07 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uSat;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - uVignette * smoothstep(0.38, 0.92, d);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb += (hash(vUv * vec2(1917.0, 1031.0) + fract(uTime) * 61.0) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
}

/**
 * Cinematic post chain: MSAA render -> bloom -> color grade -> tonemapped output.
 * opts: { bloom, bloomThreshold, bloomRadius, vignette, grain, saturation }
 */
export function buildComposer(renderer, scene, camera, opts = {}) {
  const {
    bloom = 0.7, bloomThreshold = 0.82, bloomRadius = 0.5,
    vignette = 0.5, grain = 0.028, saturation = 1.07,
  } = opts
  const size = renderer.getSize(new THREE.Vector2())
  const pr = renderer.getPixelRatio()
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
    samples: 4,
    type: THREE.HalfFloatType,
  })
  const composer = new EffectComposer(renderer, rt)
  composer.setPixelRatio(pr)
  composer.setSize(size.x, size.y)

  composer.addPass(new RenderPass(scene, camera))

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), bloom, bloomRadius, bloomThreshold)
  composer.addPass(bloomPass)

  const grade = new ShaderPass(GradeShader)
  grade.uniforms.uVignette.value = vignette
  grade.uniforms.uGrain.value = grain
  grade.uniforms.uSat.value = saturation
  composer.addPass(grade)

  composer.addPass(new OutputPass())

  composer.bloomPass = bloomPass
  composer.gradePass = grade
  return composer
}
