import * as THREE from 'three'
import caelan from './anatomy/caelan.json'
import nyra from './anatomy/nyra.json'
import serai from './anatomy/serai.json'

const DATA = { caelan, nyra, serai }
const images = new Map()
const loader = new THREE.ImageLoader()
function imageFor(id) {
  if (!images.has(id)) images.set(id, loader.loadAsync(`${import.meta.env.BASE_URL}models/textures/${id}${DATA[id]?'-face':''}.webp`))
  return images.get(id)
}
export async function preloadChampionTextures() {
  await Promise.all([...Object.keys(DATA),'engraved-metal','woven-brocade','brown-eye','hair-atlas'].map(imageFor))
}

export function dressTextures(hero,M) {
  const jobs=[]
  for(const [id,materials,repeat,bump] of [['engraved-metal',[M.bronze,M.bronzeDark],2,.002],['woven-brocade',[M.fabric,M.lining],1.8,.001]])for(const material of materials) {
    const map=new THREE.Texture();map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(repeat,repeat)
    material.map=map;material.bumpMap=map;material.bumpScale=bump;material.needsUpdate=true
    let disposed=false;map.addEventListener('dispose',()=>{disposed=true})
    jobs.push(imageFor(id).then(img=>{if(!disposed){map.image=img;map.needsUpdate=true}}))
  }
  hero.assetsReady=Promise.all([hero.assetsReady,...jobs])
  hero.assetsReady.catch(error=>{hero.assetError=error;console.error('[Champion surfaces]',hero.championId,error)})
}

const curves = {
  caelan: [[-.095,.125],[-.031,.328],[0,.444],[.04496,.592],[.10,.84],[.169,.99]],
  nyra: [[-.060,.17],[-.020,.317],[.006,.429],[.05048,.574],[.105,.842],[.163,.99]],
  serai: [[-.066,.174],[-.018,.358],[.018,.46],[.05937,.620],[.115,.88],[.191,.99]],
}
function interpolate(rows, y) {
  for (let i=1;i<rows.length;i++) if(y < rows[i][0]) return THREE.MathUtils.lerp(rows[i-1][1],rows[i][1],THREE.MathUtils.clamp((y-rows[i-1][0])/(rows[i][0]-rows[i-1][0]),0,1))
  return rows.at(-1)[1]
}

/** CC0 anatomical topology, smoothly weighted to the existing gameplay anchors. */
export function anatomicalRig(hero, a, M) {
  const d=DATA[a.championId], bones=[]
  hero.anatomy=d;hero.hipHeight=d.hipHeight;hero.hips.position.y=d.hipHeight
  const parents=[-1,0,1,1,3,4,1,6,7,0,9,0,11]
  for(let i=0;i<d.joints.length;i++) {
    const bone=new THREE.Bone();bone.name=['pelvis','chest','head','left shoulder','left elbow','left hand','right shoulder','right elbow','right hand','left hip','left knee','right hip','right knee'][i]
    const p=parents[i]
    bone.position.fromArray(d.joints[i])
    if(p>=0) {bone.position.sub(new THREE.Vector3(...d.joints[p]));bones[p].add(bone)}
    else hero.hips.add(bone)
    bones.push(bone)
  }
  hero.torso=bones[1];hero.head=bones[2]
  hero.arms={L:{pivot:bones[3],elbow:bones[4],glove:bones[5]},R:{pivot:bones[6],elbow:bones[7],glove:bones[8]}}
  hero.legs={L:{pivot:bones[9],knee:bones[10]},R:{pivot:bones[11],knee:bones[12]}}
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(d.position,3))
  const uv=d.uv.slice(),blend=new Float32Array(d.position.length/3)
  const hx=d.joints[2][0],hy=d.joints[2][1],hz=d.joints[2][2],eyeX=Math.abs(d.eyes[0][0])
  for(let i=0;i<blend.length;i++) {
    const x=d.position[i*3]-hx,y=d.position[i*3+1]-hy,z=d.position[i*3+2]-hz
    const w=d.skinIndex.slice(i*4,i*4+4).reduce((sum,id,k)=>sum+(id===2?d.skinWeight[i*4+k]:0),0)
    if(w>.5) {
      uv[i*2]=.5+x*(.120/eyeX)
      uv[i*2+1]=interpolate(curves[a.championId],y)
      blend[i]=THREE.MathUtils.smoothstep(z,.025,.075)*(1-THREE.MathUtils.smoothstep(Math.abs(x),eyeX*1.9,eyeX*2.65))
    }
  }
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2))
  geometry.setAttribute('faceBlend',new THREE.Float32BufferAttribute(blend,1))
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(d.skinIndex,4))
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(d.skinWeight,4))
  geometry.setIndex(d.index)
  geometry.computeVertexNormals();geometry.computeBoundingSphere()
  const texture=new THREE.Texture();texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4
  const face=M.face=new THREE.MeshStandardMaterial({color:'#ffffff',map:texture,roughness:.82,metalness:0,envMapIntensity:.24})
  face.onBeforeCompile=shader=>{
    shader.uniforms.sideSkin={value:M.skin.color.clone()}
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float faceBlend; varying float vFaceBlend;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFaceBlend=faceBlend;')
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 sideSkin; varying float vFaceBlend;').replace('#include <map_fragment>','diffuseColor.rgb *= mix(sideSkin, texture2D(map, vMapUv).rgb, vFaceBlend);')
  }
  face.customProgramCacheKey=()=>`anatomical-face-${a.championId}`
  // Each hero owns a Texture; clones share decoded image data, never GPU state.
  let disposed=false
  texture.addEventListener('dispose',()=>{disposed=true})
  hero.assetsReady=imageFor(a.championId).then(img=>{if(!disposed){texture.image=img;texture.needsUpdate=true}})
  hero.assetsReady.catch(error=>{hero.assetError=error;console.error('[Champion texture]',a.championId,error)})
  hero.group.updateMatrixWorld(true)
  const skeleton=new THREE.Skeleton(bones)
  hero.skinMeshes=[]
  for(const [materialIndex,material] of [M.leatherDark,M.skin,face,M.glove].entries()) {
    const indices=[]
    for(let f=0;f<d.material.length;f++)if(d.material[f]===materialIndex)indices.push(...d.index.slice(f*3,f*3+3))
    if(!indices.length)continue
    const partGeometry=geometry.clone();partGeometry.setIndex(indices)
    const mesh=new THREE.SkinnedMesh(partGeometry,material)
    mesh.name=`${a.championId}: anatomical ${['underclothes','skin','face','gloves'][materialIndex]}`
    mesh.castShadow=true;mesh.frustumCulled=false
    hero.hips.add(mesh);hero.group.updateMatrixWorld(true);mesh.bind(skeleton)
    hero.skinMeshes.push(mesh)
  }
  geometry.dispose()
  hero.skinMesh=hero.skinMeshes[0];hero.skeleton=skeleton
  // The matching CC0 eye mesh is fitted by the anatomical morph targets.
  const eyeGeometry=new THREE.BufferGeometry()
  eyeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(d.eyeMesh.position,3))
  eyeGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(d.eyeMesh.uv,2));eyeGeometry.setIndex(d.eyeMesh.index);eyeGeometry.computeVertexNormals()
  const eyeMap=new THREE.Texture();eyeMap.colorSpace=THREE.SRGBColorSpace
  M.eye.color.set('#abc1be');M.eye.map=eyeMap;M.eye.roughness=.30
  let eyesDisposed=false;eyeMap.addEventListener('dispose',()=>{eyesDisposed=true})
  hero.assetsReady=Promise.all([hero.assetsReady,imageFor('brown-eye').then(img=>{if(!eyesDisposed){eyeMap.image=img;eyeMap.needsUpdate=true}})])
  const eyes=new THREE.Mesh(eyeGeometry,M.eye);eyes.name='Anatomically fitted eyes';hero.head.add(eyes)
  return d
}

export function hairMaterial(hero,M) {
  const map=new THREE.Texture();map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4
  const material=M.hairCards=new THREE.MeshStandardMaterial({map,color:'#62584e',alphaTest:.35,alphaToCoverage:true,side:THREE.DoubleSide,roughness:.94,envMapIntensity:.08})
  let disposed=false;map.addEventListener('dispose',()=>{disposed=true})
  hero.assetsReady=Promise.all([hero.assetsReady,imageFor('hair-atlas').then(img=>{if(!disposed){map.image=img;map.needsUpdate=true}})])
  return material
}
