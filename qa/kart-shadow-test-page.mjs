// Shadow bisection harness (loaded through vite so `three` = the app's instance).
import * as THREE from 'three'
import { buildTrack } from '../src/games/kart/track.js'
import { buildComposer } from '../src/core/post.js'
import { makeEnvMap } from '../src/core/assets.js'

export async function run({ useEnv = false, useComposer = false, usePixelRatio = false } = {}) {
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  if (usePixelRatio) r.setPixelRatio(Math.min(devicePixelRatio, 2))
  r.setSize(700, 450)
  r.toneMapping = THREE.ACESFilmicToneMapping
  r.toneMappingExposure = 1.12
  r.shadowMap.enabled = true
  r.shadowMap.type = THREE.PCFSoftShadowMap
  document.body.appendChild(r.domElement)

  const scene = new THREE.Scene()
  if (useEnv) scene.environment = makeEnvMap(r)
  const track = buildTrack(scene)
  const cam = new THREE.PerspectiveCamera(60, 700 / 450, 0.1, 1000)
  const p0 = track.pos[0]
  cam.position.set(p0.x + 8, 8, p0.z - 8)
  cam.lookAt(p0.x, 0, p0.z)

  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: '#3399ff' }))
  box.position.set(p0.x, 1, p0.z + 4)
  box.castShadow = true
  scene.add(box)

  track.sun.position.copy(p0).addScaledVector(track.sunDir, 130)
  track.sun.target.position.copy(p0)

  const composer = useComposer ? buildComposer(r, scene, cam, {}) : null
  const tick = () => {
    if (composer) composer.render()
    else r.render(scene, cam)
    requestAnimationFrame(tick)
  }
  tick()
  return 'ok'
}
