import * as THREE from 'three'
import { node, part, oval, plate, strand, body, ring, rod, emblem } from './championGeometry.js'
const PI=Math.PI

// A lenticular cross-section gives steel a raised spine and tapered cutting
// edges. Light travels across the blade instead of reflecting from one plane.
function honedBlade(points,widths,depths) {
  const curve=new THREE.CatmullRomCurve3(points.map(([x,y])=>new THREE.Vector3(x,y,0)))
  const vertices=[],rings=[],segments=36
  const sample=(values,t)=>{const at=t*(values.length-1),i=Math.min(values.length-2,Math.floor(at));return THREE.MathUtils.lerp(values[i],values[i+1],at-i)}
  for(let i=0;i<=segments;i++) {
    const t=i/segments,p=curve.getPoint(t),d=curve.getTangent(t),normal=new THREE.Vector3(-d.y,d.x,0)
    const w=sample(widths,t),depth=sample(depths,t)
    rings.push([p.clone().addScaledVector(normal,-w),p.clone().add(new THREE.Vector3(0,0,depth)),p.clone().addScaledVector(normal,w),p.clone().add(new THREE.Vector3(0,0,-depth))])
  }
  for(let i=0;i<segments;i++)for(let j=0;j<4;j++) {
    const k=(j+1)%4
    for(const v of [rings[i][j],rings[i+1][j],rings[i][k],rings[i][k],rings[i+1][j],rings[i+1][k]])vertices.push(v.x,v.y,v.z)
  }
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals()
  return geometry
}
export function equipment(hero,parent,name,stowPosition,stowRotation) {
  const side=parent===hero.arms.R.glove?1:-1
  const group=hero.anatomy?node(parent,-side*.035,-.10,.060):node(parent,0,-.018,.05);group.name=name
  hero.equipment.push({group,hand:parent,heldPosition:group.position.clone(),heldRotation:group.rotation.clone(),stowPosition,stowRotation})
  return group
}


export function glaive(hero,M,a) {
  const g=equipment(hero,hero.arms.R.glove,'Dawnsworn glaive',[.15,.45,-.31],[.05,0,-.39])
  rod(g,M.dark,.019,1.48,0,.05,0)
  for(let i=0;i<12;i++) ring(g,M.trim,.020,.003,0,-.28+i*.039,0).rotation.x=PI/2
  for(const y of [-.69,.40,.67]) {rod(g,M.trim,.032,.065,0,y,0);ring(g,M.trim,.043,.005,0,y+.03,0).rotation.x=PI/2}
  const head=node(g,0,.77,0)
  const shape=new THREE.Shape()
  shape.moveTo(-.02,0);shape.bezierCurveTo(-.16,.16,-.05,.49,.14,.72);shape.bezierCurveTo(.055,.36,.22,.12,.13,.025);shape.quadraticCurveTo(.066,-.025,-.02,0)
  part(head,hero.unifiedMesh?honedBlade([[.02,.015],[.04,.17],[.045,.36],[.072,.55],[.14,.72]],[.036,.071,.07,.035,.0003],[.022,.021,.018,.012,.0003]):new THREE.ExtrudeGeometry(shape,{depth:.022,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:2,steps:1,curveSegments:14}),M.edge,0,0,hero.unifiedMesh?0:-.011)
  strand(head,M.trim,[[0,.017,.02],[-.046,.18,.02],[.027,.42,.02],[.14,.72,.0]],.008,.15)
  emblem(head,M,a.skinId==='celestial-guard'?'star':'sun',.077,.013,.048,.03)
  if(a.skinId==='ashen-oath') {
    for(let i=0;i<3;i++) strand(head,M.glow,[[.015+i*.016,.17+i*.08,.026],[.04+i*.011,.21+i*.08,.026],[.01+i*.02,.28+i*.08,.026]],.004,.7)
  } else if(a.skinId==='celestial-guard') {
    ring(head,M.trim,.125,.006,.01,.09,.018)
    for(let i=0;i<5;i++) oval(head,M.jewel,Math.sin(i*1.256)*.127,.09+Math.cos(i*1.256)*.127,.02,.009,.009,.009,10)
  }
}


export function crescent(hero,M,a,s) {
  const g=equipment(hero,hero.arms[s<0?'L':'R'].glove,'Linked crescent blade',[s*.22,.01,-.15],[0,0,s*.33])
  const shape=new THREE.Shape()
  shape.moveTo(-.095,.34);shape.bezierCurveTo(.38,.21,.36,-.21,-.06,-.32)
  shape.bezierCurveTo(.15,-.12,.15,.11,-.095,.34)
  part(g,hero.unifiedMesh?honedBlade([[-.095,.34],[.12,.20],[.22,.015],[.13,-.19],[-.06,-.32]],[.0003,.047,.05,.041,.0003],[.0003,.014,.015,.013,.0003]):new THREE.ExtrudeGeometry(shape,{depth:.019,bevelEnabled:true,bevelSize:.005,bevelThickness:.005,bevelSegments:2,steps:1,curveSegments:20}),M.edge,0,0,hero.unifiedMesh?0:-.009)
  strand(g,M.trim,[[-.095,.34,.015],[.16,.19,.015],[.24,-.05,.015],[.11,-.24,.015],[-.06,-.32,.005]],.008,.1)
  rod(g,M.leatherDark,.023,.22,0,0,0)
  emblem(g,M,a.skinId==='lunar-phantom'?'star':'sun',.036,0,.10,.018)
  ring(g,M.trim,.031,.005,0,-.13,0)
  for(let i=0;i<9;i++) {
    const link=ring(g,M.trim,.021,.004,s*(Math.sin(i*.23)*.14),-.172-i*.028,-.018*i)
    link.scale.y=.68;link.rotation.y=i%2?PI/2:0
  }
  if(a.skinId==='thornbound') for(let i=0;i<4;i++) strand(g,M.trim,[[.16,.19-i*.095,.015],[.25,.21-i*.095,.016],[.31,.23-i*.095,.013]],.015,.02)
  g.rotation.y=s*.3;g.rotation.z=-s*.23
  if(hero.unifiedMesh)g.scale.setScalar(.82)
  hero.equipment.at(-1).heldRotation.copy(g.rotation)
}


export function staff(hero,M,a) {
  const staff=equipment(hero,hero.arms.R.glove,'Elemental ring staff',[.18,.44,-.28],[0,0,-.29])
  rod(staff,M.dark,.018,1.48,0,.07,0)
  for(const y of [-.63,-.33,.2,.53,.72]) {
    rod(staff,M.trim,.027,.055,0,y,0)
    ring(staff,M.trim,.034,.004,0,y+.025,0).rotation.x=PI/2
  }
  const top=node(staff,0,.86,0);top.name='Armillary staff crown'
  ring(top,M.trim,.179,.013)
  ring(top,M.trim,.153,.009).rotation.y=.9
  ring(top,M.trim,.148,.008).rotation.x=.8
  const orb=node(top);orb.name='Suspended elemental core'
  hero.staffOrb=orb
  part(orb,new THREE.IcosahedronGeometry(.071,2),M.jewel)
  ring(orb,M.edge,.086,.004).rotation.x=.45
  if(a.skinId==='star-cartographer') {
    ring(top,M.trim,.225,.006).rotation.y=.3
    for(let i=0;i<4;i++) oval(top,M.jewel,Math.sin(i*PI/2)*.225,Math.cos(i*PI/2)*.225,0,.014,.014,.014,12)
  } else if(a.skinId==='desert-oracle') {
    for(const s of [-1,1]) strand(top,M.trim,[[s*.07,-.19,0],[s*.23,-.06,0],[s*.19,.17,0],[s*.04,.23,0]],.012,.04)
  } else {
    for(const s of [-1,1]) strand(top,M.trim,[[s*.022,-.22,0],[s*.15,-.15,0],[s*.20,.02,0],[s*.085,.22,0]],.01,.1)
  }
}
