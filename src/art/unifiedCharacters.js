import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { glaive, crescent, staff } from './championEquipment.js'
import { getChampion, getSkin } from '../meta/champions.js'

export const UNIFIED_CHAMPIONS = ['caelan', 'nyra']
const templates = new Map()
const loading = new Map()
const references = new Map()

export function hasUnifiedCharacter(appearance) {
  return UNIFIED_CHAMPIONS.includes(appearance.championId)
}

export async function preloadUnifiedCharacters() {
  await Promise.all(UNIFIED_CHAMPIONS.map(async id => {
    if (templates.has(id)) return
    if (!loading.has(id)) {
      const promise = Promise.all([
        new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/champions/${id}.glb`),
        new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}models/textures/${id}-production.webp`),
      ]).then(([gltf, reference]) => {
        let template
        gltf.scene.traverse(node => { if (node.isMesh && node.userData.warriorRig) template = node })
        if (!template || template.userData.warriorRig.championId !== id || !template.geometry.getAttribute('_rigweight')) {
          throw new Error(`The ${id} character asset is missing its animation rig`)
        }
        templates.set(id, template)
        reference.colorSpace = THREE.SRGBColorSpace
        references.set(id, reference)
      }).catch(error => { loading.delete(id); throw error })
      loading.set(id, promise)
    }
    await loading.get(id)
  }))
}

function ownMaterial(source) {
  const material = source.clone()
  const textures = new Map()
  for (const [key, value] of Object.entries(material)) if (value?.isTexture) {
    if (!textures.has(value)) {
      const texture = value.clone()
      texture.anisotropy = 8
      textures.set(value, texture)
    }
    material[key] = textures.get(value)
  }
  material.envMapIntensity = .42
  return material
}

function skinPalette(material, champion, skin, rig) {
  const signature = skin.id === champion.skins[0].id
  const metal = new THREE.Color(skin.primary)
  const textile = new THREE.Color(skin.secondary)
  const mode = { caelan: 0, nyra: 1, orren: 2, serai: 3 }[champion.id]
  material.referenceMap = references.get(champion.id).clone()
  material.referenceMap.anisotropy = 8
  // Original skin tones and hair remain outside the authored color regions.
  // The same original UV/PBR atlas supplies the surface detail for each chroma.
  material.onBeforeCompile = shader => {
    shader.uniforms.skinMetal = { value: metal }
    shader.uniforms.skinTextile = { value: textile }
    shader.uniforms.skinBodyHeight = { value: rig.height }
    shader.uniforms.skinHipHeight = { value: rig.hipHeight }
    shader.uniforms.productionReference = { value: material.referenceMap }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAuthoredPosition; varying vec3 vAuthoredNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAuthoredPosition = position; vAuthoredNormal = normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAuthoredPosition; varying vec3 vAuthoredNormal; uniform vec3 skinMetal; uniform vec3 skinTextile; uniform float skinBodyHeight; uniform float skinHipHeight; uniform sampler2D productionReference;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 base = diffuseColor.rgb;
        float h = (vAuthoredPosition.y + skinHipHeight) / skinBodyHeight;
        float x = abs(vAuthoredPosition.x) / skinBodyHeight;
        float headSurface = smoothstep(.838,.863,h);
        float skinSurface = headSurface;
        ${mode === 1 ? `skinSurface = max(skinSurface, smoothstep(.10,.13,x) * smoothstep(.61,.66,h) * (1.0-smoothstep(.80,.84,h)));
          float warmSkin = skinSurface * smoothstep(1.6,2.2,base.r/max(base.g,.001)) * (.7+.3*smoothstep(.9,1.15,base.g/max(base.b,.001)));
          base *= mix(vec3(1.0), vec3(.64,.84,.94),warmSkin);
          diffuseColor.rgb = base;` : ''}
        float detail = dot(base, vec3(.2126,.7152,.0722));
        float cloth = 0.0;
        float plate = 0.0;
        ${mode === 0 ? `cloth = smoothstep(base.r * 1.25, base.r * 1.25 + .03, base.b);
          plate = smoothstep(.10,.33,min(base.r,min(base.g,base.b)));` : ''}
        ${mode === 1 ? `cloth = smoothstep(base.g * 1.3, base.g * 1.3 + .025, base.r) * (1.0-smoothstep(.13,.18,x)) * (1.0-smoothstep(.76,.81,h));
          plate = smoothstep(base.b*1.9,base.b*1.9+.03,base.r)*smoothstep(.025,.08,base.g);` : ''}
        ${mode === 2 ? `plate = 1.0; cloth = smoothstep(base.r*1.05,base.r*1.05+.025,base.g);` : ''}
        ${mode === 3 ? `cloth = smoothstep(base.r*1.2,base.r*1.2+.025,min(base.g,base.b));
          plate = smoothstep(base.b*1.7,base.b*1.7+.04,base.r)*(1.0-smoothstep(.08,.12,x));` : ''}
        float faceGuard = ${mode === 2 ? '1.0' : '(1.0-smoothstep(.81,.85,h))'};
        ${mode === 1 ? 'plate *= 1.0 - smoothstep(.63,.70,h);' : ''}
        ${signature ? '' : `diffuseColor.rgb = mix(base, skinMetal * (detail * 1.8 + .035), plate * faceGuard * .90);
        diffuseColor.rgb = mix(diffuseColor.rgb, skinTextile * (detail * 4.0 + .12), cloth * faceGuard * .94);`}
        // Restore facial paint from the exact full-body production reference.
        // The reconstructed head geometry and its original side/back texture
        // remain intact; the high-frequency front detail follows that head.
        float faceDetail = smoothstep(.857,.886,h) * (1.0-smoothstep(.976,.996,h)) * (1.0-smoothstep(.050,.078,x)) * smoothstep(.016,.043,vAuthoredPosition.z / skinBodyHeight);
        vec2 referenceUV = vec2(.5 + vAuthoredPosition.x / skinBodyHeight * 1.4414, 1.0 - (1490.0 - h * 1476.0) / 1536.0);
        vec3 referenceColor = texture2D(productionReference, referenceUV).rgb * diffuse;
        diffuseColor.rgb = mix(diffuseColor.rgb, referenceColor, faceDetail);
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .78, skinSurface);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - skinSurface;')
  }
  material.customProgramCacheKey = () => `unified-skin-${champion.id}-${skin.id}`
}

export function buildUnifiedCharacter(hero, appearance, materials) {
  const template = templates.get(appearance.championId)
  if (!template) throw new Error(`Preload the ${appearance.championId} character before creating a hero`)
  const rig = template.userData.warriorRig
  const champion = getChampion(appearance.championId)
  const skin = getSkin(champion, appearance.skinId)
  const bones = rig.joints.map((position, index) => {
    const bone = new THREE.Bone()
    bone.name = rig.names[index]
    bone.position.fromArray(position)
    return bone
  })
  bones.forEach((bone, index) => {
    const parent = rig.parents[index]
    if (parent < 0) hero.hips.add(bone)
    else {
      bone.position.sub(new THREE.Vector3(...rig.joints[parent]))
      bones[parent].add(bone)
    }
  })
  hero.hipHeight = rig.hipHeight
  hero.hips.position.y = rig.hipHeight
  hero.torso = bones[1]
  hero.head = bones[2]
  const palm = bone => {
    const grip = new THREE.Group()
    grip.position.set(0, -.095 * rig.height / 2, .005)
    bone.add(grip)
    return grip
  }
  hero.arms = { L: { pivot: bones[3], elbow: bones[4], glove: palm(bones[5]) }, R: { pivot: bones[6], elbow: bones[7], glove: palm(bones[8]) } }
  hero.legs = { L: { pivot: bones[9], knee: bones[10] }, R: { pivot: bones[11], knee: bones[12] } }
  hero.armRestOffset = { L: rig.armRestAngle, R: -rig.armRestAngle }
  hero.gem = new THREE.Group()
  hero.torso.add(hero.gem)
  const geometry = template.geometry.clone()
  geometry.setAttribute('skinIndex', geometry.getAttribute('_rigindex'))
  geometry.setAttribute('skinWeight', geometry.getAttribute('_rigweight'))
  geometry.deleteAttribute('_rigindex'); geometry.deleteAttribute('_rigweight')
  const material = ownMaterial(template.material)
  skinPalette(material, champion, skin, rig)
  const mesh = new THREE.SkinnedMesh(geometry, material)
  mesh.name = `${champion.name}: complete textured sculpture`
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  hero.hips.add(mesh)
  hero.group.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  mesh.bind(skeleton)
  hero.skeleton = skeleton
  hero.skinMesh = mesh
  hero.skinMeshes = [mesh]
  hero.unifiedMesh = true
  hero.modelVersion = 4
  hero.championId = champion.id
  hero.skinId = skin.id
  hero.torsoWidth = 1
  hero.legSpread = 0
  hero.assetsReady = Promise.resolve()
  hero.equipment = []
  hero.secondaryMotion = []
  hero.drapes = [13,14,15,16,17].map((index, phase) => ({ bone: bones[index], phase, front: index === 16 }))
  hero.stance = { caelan: 'sentinel', nyra: 'hunter', orren: 'colossus', serai: 'oracle' }[champion.id]
  hero.modelKind = { caelan: 'vanguard', nyra: 'raider', orren: 'juggernaut', serai: 'mystic' }[champion.id]
  materials.primary = material
  materials.trim = new THREE.MeshStandardMaterial({ color: '#a98a50', metalness: .7, roughness: .49, envMapIntensity: .45 })
  materials.edge = new THREE.MeshStandardMaterial({ color: '#626e70', metalness: .48, roughness: .58, envMapIntensity: .18 })
  materials.dark = new THREE.MeshStandardMaterial({ color: '#211c19', roughness: .82 })
  materials.jewel = new THREE.MeshStandardMaterial({ color: appearance.glow, emissive: appearance.glow, emissiveIntensity: .13, metalness: .25, roughness: .28 })
  if (champion.id === 'caelan') glaive(hero, materials, appearance)
  if (champion.id === 'nyra') { crescent(hero, materials, appearance, -1); crescent(hero, materials, appearance, 1) }
  if (champion.id === 'serai') staff(hero, materials, appearance)
}
