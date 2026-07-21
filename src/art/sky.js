import * as THREE from 'three'
import { track } from './materials.js'

/**
 * Procedural sky dome — the shared atmosphere for every battleground.
 * One ShaderMaterial does it all, tuned per scene via opts:
 *   - 3-stop gradient + horizon haze band
 *   - sun disc + HDR halo (feeds bloom)
 *   - optional moon disc with in-shader mottling + halo
 *   - hash-grid stars with twinkle, hidden by clouds and sun glare
 *   - drifting fbm cloud bands with sun-lit shading
 * The material auto-ticks via tickMaterials (registered in track()).
 *
 * opts: {
 *   top, mid, bottom            — gradient stops
 *   haze, hazeAmt               — horizon band color/strength (0 disables)
 *   sunDir, sunColor, sunSize,  — sun direction (Vector3), halo color/tightness
 *   sunBoost                    — HDR multiplier on disc+halo (default 1.6)
 *   moonDir, moonColor, moonSize — optional second disc (omit moonDir to disable)
 *   stars                       — star intensity 0..1 (default 0.55)
 *   clouds: { color, shade, amount, scale, speed } — omit/falsy for clear skies
 *   radius                      — dome radius (default 480)
 * }
 */
export function sky({
  top = '#0d0a18', mid = '#33202c', bottom = '#7a4030',
  haze = '#ff9a5c', hazeAmt = 0.22, hazeBand = 0.16,
  sunDir = null, sunColor = '#ffb072', sunSize = 48, sunBoost = 1.6,
  moonDir = null, moonColor = '#cfd8ee', moonSize = 90,
  stars = 0.55,
  clouds = null,
  radius = 480,
} = {}) {
  const uniforms = {
    uTop: { value: new THREE.Color(top) },
    uMid: { value: new THREE.Color(mid) },
    uBottom: { value: new THREE.Color(bottom) },
    uHaze: { value: new THREE.Color(haze) },
    uHazeAmt: { value: hazeAmt },
    uHazeBand: { value: hazeBand },
    uSunDir: { value: (sunDir || new THREE.Vector3(0.4, 0.2, -0.6)).clone().normalize() },
    uSunColor: { value: new THREE.Color(sunColor) },
    uSunSize: { value: sunSize },
    uSunBoost: { value: sunBoost },
    uSunOn: { value: sunDir ? 1 : 0 },
    uMoonDir: { value: (moonDir || new THREE.Vector3(-0.4, 0.5, 0.6)).clone().normalize() },
    uMoonColor: { value: new THREE.Color(moonColor) },
    uMoonSize: { value: moonSize },
    uMoonOn: { value: moonDir ? 1 : 0 },
    uStars: { value: stars },
    uCloudColor: { value: new THREE.Color(clouds?.color || '#5a3f3c') },
    uCloudShade: { value: new THREE.Color(clouds?.shade || '#241a22') },
    uCloudAmt: { value: clouds?.amount ?? 0 },
    uCloudScale: { value: clouds?.scale ?? 0.9 },
    uCloudSpeed: { value: clouds?.speed ?? 1 },
    uTime: { value: 0 },
  }
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWp;
      void main() {
        vWp = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uBottom, uHaze, uSunColor, uMoonColor, uCloudColor, uCloudShade;
      uniform vec3 uSunDir, uMoonDir;
      uniform float uSunSize, uSunBoost, uSunOn, uMoonSize, uMoonOn, uStars;
      uniform float uCloudAmt, uCloudScale, uCloudSpeed, uHazeAmt, uHazeBand, uTime;
      varying vec3 vWp;

      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash2(i), b = hash2(i + vec2(1, 0)), c = hash2(i + vec2(0, 1)), d = hash2(i + vec2(1, 1));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
      float cfbm(vec2 p) {
        // 3 rotated octaves — kills the bilinear grid alignment of plain value noise
        return vnoise(p) * 0.55 + vnoise(ROT * p * 2.13 + 17.7) * 0.3 + vnoise(ROT * ROT * p * 4.31 + 41.3) * 0.15;
      }

      void main() {
        vec3 d = normalize(vWp);
        float h = d.y;

        // gradient + equator lift
        vec3 col = mix(uBottom, uMid, smoothstep(-0.08, 0.22, h));
        col = mix(col, uTop, smoothstep(0.22, 0.75, h));
        col += uMid * 0.22 * pow(1.0 - abs(h), 3.0);

        // sun halo + disc (HDR — picked up by bloom)
        float sd = max(dot(d, uSunDir), 0.0);
        float halo = pow(sd, uSunSize);
        col += uSunOn * uSunColor * halo * uSunBoost;
        float disc = smoothstep(0.99915, 0.99965, sd);
        col += uSunOn * uSunColor * disc * 2.4 * uSunBoost;

        // horizon haze hugs y≈0 (aerial-perspective anchor for the backdrop rings)
        float hz = 1.0 - smoothstep(0.0, uHazeBand, abs(h + 0.012));
        col = mix(col, uHaze, hz * uHazeAmt);

        // moon: mottled disc + faint halo
        if (uMoonOn > 0.5) {
          float md = max(dot(d, uMoonDir), 0.0);
          float mdisc = smoothstep(0.99935, 0.99972, md);
          float mot = vnoise(d.xz * 260.0 + 31.0) * 0.5 + vnoise(d.xy * 520.0) * 0.3;
          col += uMoonColor * (mdisc * (1.5 - mot * 0.75) + pow(md, uMoonSize) * 0.45);
        }

        // drifting cloud bands on a virtual plane. The 0.35 projection constant
        // damps horizon stretching; a low-frequency mask warps the detail noise
        // into discrete patchy banks with clear sky between — never a film.
        float cover = 0.0;
        if (uCloudAmt > 0.001 && d.y > 0.04) {
          vec2 cp = d.xz / (d.y * 0.9 + 0.35) * uCloudScale + uTime * uCloudSpeed * vec2(0.012, 0.005);
          float mask = cfbm(cp * 0.33 + 7.3);
          float n = cfbm(cp + mask * 0.7);
          cover = smoothstep(0.66, 0.92, n) * smoothstep(0.45, 0.7, mask) * uCloudAmt * smoothstep(0.04, 0.28, d.y);
          float lit = halo * 0.5 + disc;
          vec3 cc = mix(uCloudShade, uCloudColor, clamp(n * n * 1.3, 0.0, 1.0));
          cc = mix(cc, uSunColor * 0.5 + uCloudColor * 0.5, clamp(lit, 0.0, 1.0) * 0.3);
          col = mix(col, cc, cover * 0.55);
        }

        // stars: stable 3D hash grid, twinkle, killed by glare/clouds/horizon
        if (uStars > 0.001) {
          vec3 sp = d * 92.0;
          vec3 cell = floor(sp);
          vec3 f = fract(sp) - 0.5;
          float hs = hash3(cell);
          float on = step(0.958, hs);
          float tw = 0.5 + 0.5 * sin(uTime * (0.8 + hs * 4.5) + hs * 61.0);
          float star = smoothstep(0.17, 0.03, length(f)) * on * tw;
          float vis = smoothstep(0.05, 0.28, h) * (1.0 - cover) * (1.0 - clamp(halo * 2.2, 0.0, 1.0));
          col += vec3(1.0, 0.93, 0.82) * star * uStars * vis;
        }

        gl_FragColor = vec4(col, 1.0);
      }`,
  })
  track(mat)
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 24), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -10 // painter's backstop: sky always sorts first
  return mesh
}
