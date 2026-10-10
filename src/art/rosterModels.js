import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { pbrMaterial, clothMaterial, stoneMaterial, woodMaterial } from './materials.js'
import { node, part, oval, plate, strand, batchJoint, body, ring, rod, band, emblem, drape } from './championGeometry.js'
import { anatomicalRig, dressTextures, hairMaterial } from './anatomicalRig.js'
import { equipment, glaive, crescent, staff } from './championEquipment.js'
import stoneFace from './anatomy/caelan.json'

const PI=Math.PI
export const hasRosterModel=a=>['caelan','nyra','orren','serai'].includes(a.championId)
function palette(hero,a,M) {
  const silver=['celestial-guard','lunar-phantom','frost-relic'].includes(a.skinId)
  M.trim=pbrMaterial({color:silver?'#a9b5c6':'#a3834d',metalness:.82,roughness:.36})
  M.dark=pbrMaterial({color:'#211c1a',roughness:.8})
  M.edge=pbrMaterial({color:silver?'#c1ceda':'#c3beb0',metalness:.87,roughness:.29})
  M.fabric=clothMaterial(a.secondary);M.fabric.map=null;M.fabric.normalScale.setScalar(.13)
  M.lining=clothMaterial(a.skinId==='ashen-oath'?'#756651':'#c8bfaa');M.lining.map=null;M.lining.normalScale.setScalar(.12)
  M.jewel=pbrMaterial({color:a.glow,emissive:a.glow,emissiveIntensity:.12,metalness:.3,roughness:.18})
  M.skin.color.set(a.championId==='caelan'?'#8d654b':a.championId==='nyra'?'#7f543b':'#805940');M.skin.roughness=.84
  M.eye=pbrMaterial({color:'#827d6a',roughness:.38});M.iris=pbrMaterial({color:'#493626',roughness:.35})
  M.glove=pbrMaterial({color:'#302923',roughness:.78})
  M.hair.color.set('#201c19');M.hair.roughness=.72
  M.hairLight=pbrMaterial({color:a.championId==='serai'?'#928a7d':'#40352b',roughness:.76})
  M.bronze.normalScale.setScalar(.08);M.bronze.roughness=.47;M.bronze.metalness=.68
  M.bronze.envMapIntensity=.38;M.bronzeDark.envMapIntensity=.35;M.edge.envMapIntensity=.4;M.trim.envMapIntensity=.45
  M.bronzeDark.normalScale.setScalar(.08);M.leather.normalScale.setScalar(.16);M.leatherDark.normalScale.setScalar(.15)
  if(a.championId==='nyra'){M.bronze.roughness=.63;M.bronze.metalness=.36}
  hero.secondaryMotion=[];hero.equipment=[];hero.modelVersion=3;hero.championId=a.championId;hero.skinId=a.skinId;hero.torsoWidth=1
}

// A shaped shell with a raised central keel and rolled metal edging.
// Outlines, overlap, pitch and curvature are authored separately for each suit.
function shell(parent,M,outline,{at=[0,0,0],rot=[0,0,0],curve=.025,depth=.008,mat=M.bronze,edge=true}={}) {
  const g=node(parent,...at);g.rotation.set(...rot)
  const shape=new THREE.Shape(outline.map(p=>new THREE.Vector2(...p)))
  const base=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1,steps:1,curveSegments:8})
  // Tessellate before bending: a polygon's corner vertices alone cannot form
  // a convex breastplate. Keep the costume solid from oblique camera angles.
  let pos=Array.from(base.attributes.position.array),uv=Array.from(base.attributes.uv.array)
  for(let step=0;step<2;step++) {
    const next=[],tex=[]
    for(let i=0;i<pos.length;i+=9) {
      const p=[0,1,2].map(j=>pos.slice(i+j*3,i+j*3+3)),u=[0,1,2].map(j=>uv.slice(i/3*2+j*2,i/3*2+j*2+2))
      const mid=(a,b)=>a.map((v,k)=>(v+b[k])*.5)
      const q=[...p,mid(p[0],p[1]),mid(p[1],p[2]),mid(p[2],p[0])],v=[...u,mid(u[0],u[1]),mid(u[1],u[2]),mid(u[2],u[0])]
      for(const j of [0,3,5,3,1,4,5,4,2,3,4,5]){next.push(...q[j]);tex.push(...v[j])}
    }
    pos=next;uv=tex
  }
  base.dispose()
  const dense=new THREE.BufferGeometry();dense.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));dense.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2))
  const maxX=Math.max(...outline.map(p=>Math.abs(p[0])))||1
  const bulge=x=>curve*(1-(x/maxX)**2)
  const p=dense.attributes.position
  for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)+bulge(p.getX(i)))
  const geo=mergeVertices(dense);dense.dispose();geo.computeVertexNormals();part(g,geo,mat)
  if(edge)strand(g,M.trim,[...outline,outline[0]].map(([x,y])=>[x,y,depth+bulge(x)+.004]),.0028,1)
  return g
}
function etch(parent,M,points,r=.0022){return strand(parent,M.trim,points,r,1)}
function strap(parent,M,points,width=.014){return strand(parent,M.leatherDark,points,width,.9)}

function hair(hero,M,kind) {
  const d=hero.anatomy,head=hero.head,top=d.headBounds[1][1],rx=d.headBounds[1][0]*.91,rz=(d.headBounds[1][2]-d.headBounds[0][2])*.43
  const material=hairMaterial(hero,M),scalp=[],scalpUV=[]
  // Clip a fitted scalp along the hairline, excluding the anatomical ears.
  for(let f=0;f<d.material.length;f++)if(d.material[f]===2) {
    const tri=d.index.slice(f*3,f*3+3).map(i=>[d.position[i*3]-d.joints[2][0],d.position[i*3+1]-d.joints[2][1],d.position[i*3+2]-d.joints[2][2]])
    const cutoff=([x,y,z])=>y-Math.max(z>.025?top*.65+Math.abs(x)*.1:-.015,Math.abs(x)>rx*.75&&z>-.055?top*.37:-.02)
    const polygon=[]
    for(let i=0;i<3;i++) {
      const a=tri[i],b=tri[(i+1)%3],da=cutoff(a),db=cutoff(b)
      if(da>=0)polygon.push(a)
      if((da>=0)!==(db>=0))polygon.push(a.map((v,k)=>v+(b[k]-v)*da/(da-db)))
    }
    for(let i=1;i<polygon.length-1;i++)for(const p of [polygon[0],polygon[i],polygon[i+1]]){scalp.push(p[0]*1.02,p[1]+.002,p[2]*1.02);scalpUV.push(((kind==='curls'?2:0)+.5+THREE.MathUtils.clamp(p[0]/rx,-1,1)*.22)/4,THREE.MathUtils.clamp(p[1]/top*.68+.18,.16,.90))}
  }
  const scalpMat=M.scalp=new THREE.MeshStandardMaterial({color:'#514942',map:material.map,roughness:.89,envMapIntensity:.08})
  const cap=new THREE.BufferGeometry();cap.setAttribute('position',new THREE.Float32BufferAttribute(scalp,3));cap.setAttribute('uv',new THREE.Float32BufferAttribute(scalpUV,2));const smooth=mergeVertices(cap);cap.dispose();smooth.computeVertexNormals();part(head,smooth,scalpMat)
  function card(parent,points,width,column,axis=[1,0,0],fitCrown=false) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),pos=[],uv=[],idx=[]
    for(let j=0;j<=16;j++) {
      const t=j/16,p=curve.getPoint(t),w=width*(1-.35*t*t)
      for(const u of [0,1]) {
        const x=p.x+(u-.5)*w*axis[0],z=p.z+(u-.5)*w*axis[2]
        const y=fitCrown?crownY(x,z)+.004+.003*Math.sin(t*PI):p.y+(u-.5)*w*axis[1]
        pos.push(x,y,z);uv.push((column+u)/4,.97-t*.93)
      }
      if(j<16){const i=j*2;idx.push(i,i+2,i+1,i+1,i+2,i+3)}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals()
    return part(parent,geo,material)
  }
  const crown=[]
  for(let i=0;i<d.position.length;i+=3){const x=d.position[i]-d.joints[2][0],y=d.position[i+1]-d.joints[2][1],z=d.position[i+2]-d.joints[2][2];if(y>top*.47)crown.push([x,y,z])}
  const crownY=(x,z)=>{
    const nearest=crown.map(p=>({p,d:(p[0]-x)**2+(p[2]-z)**2})).sort((a,b)=>a.d-b.d).slice(0,5)
    let sum=0,w=0;for(const n of nearest){const q=1/(n.d+.00001);sum+=n.p[1]*q;w+=q}return sum/w
  }
  // Layered textured ribbons conform to the actual cranial surface.
  for(let i=0;i<(kind==='braids'?13:32);i++) {
    const n=kind==='braids'?13:32,u=(i-(n-1)/2)/(n/2),x=u*rx*.85
    // Derive the hairline from this head, so locks cannot project beyond the
    // narrower huntress forehead or form a rigid fringe above the eyes.
    const local=crown.filter(p=>Math.abs(p[0]-x)<.008&&p[1]>top*.66+Math.abs(x)*.10)
    const front=Math.max(...local.map(p=>p[2]))-.004,back=Math.min(...local.map(p=>p[2]))+.004
    const points=Array.from({length:10},(_,j)=>{
      const t=j/9,z=front+(back-front)*t,px=x+(kind==='swept'?-.008*Math.sin(t*PI):kind==='curls'?.004*Math.sin(t*PI*3+i):0)
      return [px,crownY(px,z)+.004,z]
    })
    card(head,points,kind==='braids'?.012:.021,kind==='braids'?3:kind==='curls'?2:i%3===0?1:0,[1,0,0],true)
  }
  for(const s of [-1,1])for(let i=0;i<8;i++)card(head,[[s*rx*.81,top*.83,.031-i*.010],[s*rx,top*.44,-.021-i*.009],[s*rx*.76,.007,-.063-i*.004]],.036,kind==='curls'?2:0,[0,0,1])
  if(kind==='braids')for(const s of [-1,1]) {
    const braid=node(head,s*.060,top*.52,-.098);braid.name='Woven animated huntress braid'
    const points=[[0,0,0],[s*.048,-.15,-.035],[s*.09,-.34,-.025],[s*.14,-.57,.013]]
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),geo=new THREE.TubeGeometry(curve,32,.021,10,false),uv=geo.attributes.uv,p=geo.attributes.position
    for(let i=0;i<uv.count;i++){const t=uv.getX(i),v=uv.getY(i),c=curve.getPointAt(t);p.setXYZ(i,c.x+(p.getX(i)-c.x)*(1-.6*t),c.y+(p.getY(i)-c.y)*(1-.6*t),c.z+(p.getZ(i)-c.z)*(1-.6*t));uv.setXY(i,.775+v*.19,1-t)}
    geo.computeVertexNormals();part(braid,geo,material)
    card(braid,points,.070,3);card(braid,points,.064,3,[0,0,1])
    for(const t of [.12,.49]){const p=curve.getPoint(t/.57);ring(braid,M.trim,.018*(1-t*.5),.003,p.x,p.y,p.z).rotation.x=PI/2}
    hero.secondaryMotion.push({group:braid,axis:'z',base:s*.11,phase:s,amount:.14})
  }
  if(kind==='curls')for(let i=0;i<46;i++) {
    const a=i*2.39996,x=Math.sin(a)*rx*1.06,z=-.025-Math.abs(Math.cos(a))*rz*.87,y=top*.73-(i%5)*.013,length=.31+(i%4)*.038
    card(head,[[x,y,z],[x+.012*Math.sin(i),y-length*.3,z-.027],[x-.011*Math.sin(i),y-length*.65,z-.038],[x+.017*Math.sin(i),y-length,z-.031]],.045,2,i%2?[1,0,0]:[.5,0,.86])
  }
}

function humanBoot(hero,M,key,{height=.35,width=.074,armored=false}={}) {
  const leg=hero.legs[key],knee=leg.knee,foot=-hero.hipHeight-hero.anatomy.joints[key==='L'?10:12][1]+.052
  body(knee,M.leatherDark,[[foot-.045,width*.94,.174,.079],[foot,width*1.06,.186,.074],[foot+.09,width*.78,.083,.01],[foot+height,width*.97,.072]])
  const outline=[[-width*.76,.04],[0,.075],[width*.76,.04],[width*.87,-height*.50],[width*.48,-height*.84],[0,-height*.96],[-width*.57,-height*.81],[-width*.85,-height*.46]]
  if(armored)shell(knee,M,outline,{at:[0,-.04,.070],curve:.016})
  for(let i=0;i<4;i++)band(knee,M.trim,width*.91,.111,foot+.02+i*.026,.031,.0025,-1.6,1.6)
}

function lapel(parent,M,points,width) {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),pos=[],uv=[],index=[]
  for(let j=0;j<=20;j++) {
    const t=j/20,p=curve.getPoint(t)
    for(const s of [-1,1]){pos.push(p.x+s*width*.5*(1-t*.35),p.y,p.z+.009);uv.push((s+1)*.5,1-t)}
    if(j<20){const i=j*2;index.push(i,i+2,i+1,i+1,i+2,i+3)}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(index);geo.computeVertexNormals();part(parent,geo,M.lining)
}

function caelan(hero,a,M) {
  anatomicalRig(hero,a,M);hair(hero,M,'swept')
  const t=hero.torso
  shell(t,M,[[-.198,.59],[-.113,.656],[0,.615],[.113,.656],[.198,.59],[.237,.43],[.155,.21],[0,.16],[-.155,.21],[-.237,.43]],{at:[0,0,.155],curve:.066})
  for(const s of [-1,1]) {
    const arm=hero.arms[s<0?'L':'R'].pivot
    // Raised pointed pauldrons sweep back over the shoulder, no round shells.
    for(let i=0;i<3;i++) {
      const points=[[-.105,.045],[.0,.12],[.154,.18],[.132,.047],[.15,-.087],[.075,-.136],[-.095,-.078]].map(([x,y])=>[x*s,y])
      shell(arm,M,points,{at:[s*i*.012,-i*.069,.048-i*.012],rot:[-.18, s*.25,-s*.18],curve:.077-i*.012})
    }
    emblem(arm,M,a.skinId==='celestial-guard'?'star':'sun',.055,s*.03,.023,.137)
    const elbow=hero.arms[s<0?'L':'R'].elbow
    const length=-hero.arms[s<0?'L':'R'].glove.position.y
    shell(elbow,M,[[-.073,.025],[0,.072],[.078,.022],[.072,-length*.62],[.043,-length*.90],[-.039,-length*.91],[-.065,-length*.65]],{at:[0,0,.062],curve:.033})
    etch(elbow,M,[[0,.057,.107],[.024,-.12,.098],[0,-length*.85,.086]],.0035)
    const thigh=hero.legs[s<0?'L':'R'].pivot
    shell(thigh,M,[[-.093,-.058],[.072,-.035],[.10,-.18],[.056,-.36],[0,-.414],[-.078,-.345],[-.107,-.19]],{at:[0,0,.106],curve:.033})
    etch(thigh,M,[[0,-.07,.151],[s*.04,-.2,.153],[0,-.39,.149]],.003)
    humanBoot(hero,M,s<0?'L':'R',{height:.39,width:.078,armored:true})
    const panel=drape(hero,hero.hips,M,{x:s*.15,y:.08,z:.12,width:.19,length:.64,flare:1.45,back:-.06,phase:s});panel.rotation.y=s*.58;panel.rotation.z=-s*.10
    shell(panel,M,[[-.074,0],[.069,.02],[.083,-.22],[0,-.30],[-.078,-.23]],{at:[0,0,.025],curve:.025})
  }
  for(let i=0;i<4;i++) {
    shell(t,M,[[-.172+i*.004,.026],[0,.06],[.172-i*.004,.026],[.153-i*.004,-.023],[0,-.042],[-.153+i*.004,-.023]],{at:[0,.19-i*.04,.139],curve:.036,mat:i%2?M.bronze:M.bronzeDark})
  }
  strap(t,M,[[.17,.58,.209],[.08,.40,.244],[-.06,.2,.23],[-.15,.03,.182]],.013)
  const tabard=drape(hero,hero.hips,M,{y:.052,z:.163,width:.23,length:.76,flare:1.3,phase:1})
  emblem(tabard,M,a.skinId==='celestial-guard'?'star':'sun',.048,0,-.5,.028)
  for(let i=0;i<5;i++)etch(tabard,M,[[-.078,-.12-i*.095,.015],[-.048,-.17-i*.095,.023],[.048,-.17-i*.095,.023],[.078,-.12-i*.095,.015]],.0015)
  body(t,M.fabric,[[.594,.085,.086,.02],[.636,.095,.094,.03],[.674,.072,.072,.04]])
  hero.capeStyle={width:.90,length:1.53,anchor:.57,back:-.13,flare:1.55,ragged:a.skinId==='ashen-oath',material:M.fabric}
  hero.modelKind='vanguard';hero.stance='sentinel';hero.legSpread=.07
  if(a.skinId==='celestial-guard')for(const s of [-1,1])etch(hero.head,M,[[s*.065,.125,-.035],[s*.105,.19,-.07],[s*.12,.23,-.095]],.009)
  glaive(hero,M,a)
}

function nyra(hero,a,M) {
  anatomicalRig(hero,a,M);hair(hero,M,'braids')
  const t=hero.torso
  // Close, asymmetric leather cuirass; exposed shoulder contours stay slender.
  shell(t,M,[[-.155,.458],[-.062,.491],[0,.433],[.062,.491],[.16,.43],[.139,.285],[.103,.152],[0,.126],[-.111,.163],[-.133,.29]],{at:[0,0,.113],curve:.047,mat:M.leather})
  for(const s of [-1,1]) {
    strap(t,M,[[s*.148,.458,.154],[s*.117,.38,.176],[s*.065,.30,.174],[-s*.10,.158,.151]],.012)
    etch(t,M,[[s*.128,.44,.168],[s*.141,.36,.161],[s*.09,.23,.163]],.0025)
    const arm=hero.arms[s<0?'L':'R'].pivot
    if(s<0)for(let i=0;i<2;i++)shell(arm,M,[[-.073,.045],[.028,.075],[.122,.023],[.101,-.076],[.02,-.13],[-.071,-.064]],{at:[-.013,-i*.064,.035],curve:.047,mat:M.leather})
    else band(arm,M.trim,.059,.068,-.13,0,.008,-PI,PI)
    const elbow=hero.arms[s<0?'L':'R'].elbow
    shell(elbow,M,[[-.056,-.019],[.045,.008],[.055,-.13],[.031,-.22],[-.036,-.212]],{at:[0,0,.039],curve:.023,mat:M.leather})
    for(let j=0;j<3;j++)band(elbow,M.trim,.050,.061,-.069-j*.055,0,.003,-1.6,1.6)
    const leg=hero.legs[s<0?'L':'R'].pivot
    shell(leg,M,[[-.067,-.07],[.065,-.065],[.075,-.205],[.034,-.29],[-.047,-.3],[-.079,-.19]],{at:[0,0,.081],curve:.023,mat:M.leather})
    humanBoot(hero,M,s<0?'L':'R',{height:.35,width:.059})
    for(let i=0;i<5;i++)etch(leg,M,[[s*.032,-.1-i*.037,.114],[-s*.03,-.117-i*.037,.113]],.002)
    const sash=drape(hero,hero.hips,M,{x:s*.12,y:.08,z:.102,width:s<0?.20:.10,length:s<0?.65:.35,flare:1.25,color:s<0?M.fabric:M.lining,phase:s});sash.rotation.z=-s*.25;sash.rotation.y=s*.30
    const earX=hero.anatomy.headBounds[1][0]
    ring(hero.head,M.trim,.014,.0028,s*earX,-.01,.035).scale.y=1.4
  }
  body(t,M.leatherDark,[[.054,.145,.106],[.135,.133,.114]])
  band(t,M.trim,.143,.12,.091,0,.008,-PI,PI)
  emblem(t,M,'sun',.025,.01,.09,.129)
  body(t,M.fabric,[[.515,.07,.071],[.55,.084,.082],[.593,.07,.066]])
  const scarf=drape(hero,t,M,{x:-.078,y:.51,z:-.075,width:.27,length:.53,flare:1.45,back:-.06,phase:2});scarf.rotation.z=-.38
  if(a.skinId==='lunar-phantom') {
    const veil=M.veil=clothMaterial('#9ca1bc');veil.map=null;veil.transparent=true;veil.opacity=.62;veil.depthWrite=false
    drape(hero,hero.head,M,{y:.12,z:-.093,width:.24,length:.54,color:veil,phase:1})
  }
  if(a.skinId==='thornbound')for(let i=0;i<5;i++)strand(hero.arms.L.pivot,M.trim,[[-.04,.04,-.04+i*.027],[-.10,.1,-.04+i*.027],[-.15,.15,-.065+i*.027]],.010,.02)
  hero.capeStyle={width:.48,length:.66,anchor:.5,back:-.10,flare:1.4,ragged:true,material:M.fabric}
  hero.modelKind='raider';hero.stance='hunter';hero.idleKnee=.32;hero.idleCrouch=.025;hero.legSpread=.10;hero.bodyLean=.07
  crescent(hero,M,a,-1);crescent(hero,M,a,1)
}

function serai(hero,a,M) {
  anatomicalRig(hero,a,M);hair(hero,M,'curls')
  const t=hero.torso
  body(t,M.fabric,[[.10,.138,.144],[.22,.136,.159],[.35,.185,.21],[.46,.185,.185],[.54,.126,.103],[.60,.065,.074]])
  for(const s of [-1,1]) {
    lapel(t,M,[[s*.085,.59,.119],[s*.090,.49,.185],[s*.075,.38,.219],[0,.235,.176]],.075)
    const arm=hero.arms[s<0?'L':'R'].pivot
    body(arm,M.fabric,[[-.26,.061,.076],[-.18,.080,.093],[-.07,.11,.108],[.053,.066,.068]])
    shell(arm,M,[[-.073,.025],[.031,.104],[.13,.079],[.108,-.06],[.011,-.099],[-.079,-.034]],{at:[s*.013,0,.052],curve:.036})
    const elbow=hero.arms[s<0?'L':'R'].elbow
    // Bell sleeves and their ivory linings extend the mage's flowing silhouette.
    const sleeve=body(elbow,M.fabric,[[-.20,.17,.137],[-.12,.126,.11],[-.025,.068,.065],[.037,.061,.063]],0,0,-.018)
    const lining=drape(hero,elbow,M,{x:s*.045,y:-.18,z:-.11,width:.29,length:.37,flare:1.5,color:M.lining,back:-.10,phase:s});lining.rotation.z=s*.2
    band(elbow,M.trim,.17,.141,-.193,-.018,.004,-PI,PI)
    for(let i=0;i<3;i++)band(elbow,M.trim,.125+i*.013,.10+i*.01,-.10-i*.03,-.018,.0025,-1.5,1.5)
    for(let i=0;i<5;i++) {
      const angle=s*(.17+i*.32)
      const skirt=drape(hero,hero.hips,M,{x:Math.sin(angle)*.145,y:.10-i*.013,z:Math.cos(angle)*.124,width:.22,length:1.03-(i%2)*.12,flare:2.6,back:.22,phase:i+s,color:i%2?M.lining:M.fabric})
      skirt.rotation.y=angle;skirt.rotation.z=-s*(.08+i*.01)
      if(i%2===0) {
        for(let j=0;j<4;j++)ring(skirt,M.trim,.035+j*.023,.0018,0,-.68,.028,PI)
        emblem(skirt,M,a.skinId==='star-cartographer'?'star':'tide',.031,0,-.78,.038)
      }
    }
    humanBoot(hero,M,s<0?'L':'R',{height:.37,width:.061,armored:true})
    ring(hero.head,M.trim,.017,.0028,s*hero.anatomy.headBounds[1][0],-.016,.031).scale.y=1.6
    oval(hero.head,M.jewel,s*hero.anatomy.headBounds[1][0],-.047,.033,.006,.010,.005,12)
  }
  for(let i=0;i<4;i++){body(t,M.bronzeDark,[[.018,.14,.137],[-.015,.144,.14]],0,.18-i*.036,.006);band(t,M.trim,.146,.146,.20-i*.036,.006,.003)}
  emblem(t,M,a.skinId==='star-cartographer'?'star':'tide',.028,0,.255,.153)
  body(t,M.fabric,[[.596,.065,.066],[.641,.09,.08],[.670,.068,.066]])
  const scarf=drape(hero,t,M,{x:-.074,y:.615,z:.093,width:.18,length:.46,flare:1.5,phase:1});scarf.rotation.z=-.41
  hero.capeStyle={width:.68,length:1.51,anchor:.58,back:-.12,flare:1.85,ragged:false,material:M.lining}
  if(a.skinId==='desert-oracle')for(let i=0;i<4;i++){const wrap=ring(hero.head,M.lining,.088,.010,0,.11+i*.017,-.006);wrap.rotation.x=PI/2;wrap.scale.y=1.12}
  if(a.skinId==='star-cartographer'){ring(hero.head,M.trim,.092,.004,0,.17,0,PI);for(let i=0;i<5;i++)oval(hero.head,M.jewel,(i-2)*.028,.18+Math.sin(i*PI/4)*.035,0,.004,.004,.005,10)}
  hero.modelKind='mystic';hero.stance='oracle';hero.legSpread=.03
  staff(hero,M,a)
}

// Deterministic uneven fractured stone, with no human torso or limb template.
function rock(parent,M,pos,scale,seed=1,material=M.stone) {
  const source=new THREE.IcosahedronGeometry(1,5);source.deleteAttribute('normal');const geo=mergeVertices(source);source.dispose();const p=geo.attributes.position
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=1+.10*Math.sin(x*11+y*7+seed)*Math.cos(z*13+seed)+.05*Math.sin(y*23-z*9)
    p.setXYZ(i,x*r,y*r,z*r)
  }
  geo.computeVertexNormals();const mesh=part(parent,geo,material,...pos);mesh.scale.set(...scale);mesh.rotation.set(seed*.13,seed*.31,seed*.19);return mesh
}
function root(parent,M,points,r=.032){return strand(parent,M.root,points,r,.18)}
function orren(hero,a,M) {
  M.stone=stoneMaterial(a.primary);M.stone.normalScale.setScalar(.40);M.stone.roughness=.91
  M.root=woodMaterial(a.skinId==='furnace-king'?'#332c25':'#504535');M.root.normalScale.setScalar(.36)
  M.moss=pbrMaterial({color:'#47553a',roughness:1});M.primary=M.stone;M.secondary=M.fabric
  if(a.skinId==='furnace-king'){M.stone.metalness=.52;M.stone.roughness=.65}
  if(a.skinId==='frost-relic'){M.stone.metalness=.15;M.stone.roughness=.36}
  hero.hipHeight=.84;hero.hips.position.y=.84;hero.torso=node(hero.hips,0,.42,-.07)
  const t=hero.torso
  rock(t,M,[0,.04,-.06],[.39,.48,.30],3)
  rock(t,M,[-.24,.24,-.025],[.31,.30,.29],7)
  rock(t,M,[.26,.15,.0],[.30,.32,.26],11)
  rock(t,M,[0,.26,-.22],[.35,.27,.27],5)
  for(const s of [-1,1])for(let i=0;i<4;i++) {
    rock(t,M,[s*(.105+i*.03),.16-i*.105,.205],[.17-i*.016,.075,.10],i+3+s)
    root(t,M,[[s*.14,.44,-.13],[s*.34,.26,.04],[s*.29,.06,.255],[s*.19,-.22,.213],[s*.24,-.41,.12]],.038-i*.005)
  }
  hero.arms={};hero.legs={}
  for(const s of [-1,1]) {
    const key=s<0?'L':'R',arm=node(hero.hips,s*(s<0?.50:.46),s<0?.67:.59,-.075),elbow=node(arm,s*.036,-.34,.04),glove=node(elbow,0,-.38,.055)
    hero.arms[key]={pivot:arm,elbow,glove}
    rock(arm,M,[s*.045,-.07,0],[s<0?.285:.215,.285,.235],s+7)
    rock(elbow,M,[0,-.18,0],[s<0?.24:.19,.295,.205],s+11)
    rock(glove,M,[0,-.035,.019],[.136,.13,.121],s+14)
    for(let f=0;f<4;f++)rock(glove,M,[(f-1.5)*.053,-.095,.081],[.034,.085,.037],f+7)
    for(let i=0;i<5;i++)root(arm,M,[[s*.04,.18,-.08+i*.036],[s*.20,.06,.04+i*.035],[s*.15,-.13,.17],[s*.09,-.32,.12]],.028-i*.002)
    for(let i=0;i<4;i++)root(elbow,M,[[s*.08,.03,.10],[s*(.15-i*.02),-.15,.18],[s*.05,-.37,.14]],.026)
    const leg=node(hero.hips,s*.255,-.015,-.045),knee=node(leg,s*.025,-.37,.035)
    hero.legs[key]={pivot:leg,knee}
    rock(leg,M,[0,-.14,0],[.19,.265,.21],8+s)
    rock(knee,M,[0,-.17,0],[.175,.24,.17],5+s)
    rock(knee,M,[s*.025,-.375,.09],[.204,.084,.29],9+s).rotation.set(.04,s*.12,0)
    for(let i=0;i<4;i++)root(leg,M,[[s*.08,.13,.03],[s*.17,-.03,.14],[s*.10,-.3,.16],[s*.055,-.41,.04]],.035-i*.004)
    for(let i=0;i<3;i++)root(knee,M,[[s*.13,.02,.14],[s*.15,-.17,.17],[s*.05,-.31,.24]],.024)
    shell(knee,M,[[-.13,.06],[.11,.085],[.151,-.075],[.03,-.20],[-.12,-.11]],{at:[0,0,.17],curve:.016,depth:.018})
  }
  // A worn monolithic face sits within the shoulder mass, not above a neck.
  hero.head=node(hero.hips,0,.80,.14)
  const verts=[],idx=[],d=stoneFace
  const map=new Map()
  for(let f=0;f<d.material.length;f++)if(d.material[f]===2)for(let k=0;k<3;k++) {
    const id=d.index[f*3+k]
    if(!map.has(id)) {
      const x=d.position[id*3]-d.joints[2][0],y=d.position[id*3+1]-d.joints[2][1],z=d.position[id*3+2]-d.joints[2][2]
      map.set(id,verts.length/3);verts.push(x*1.77,y*1.53,z*1.45)
    }
    idx.push(map.get(id))
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(verts.flatMap((_,i)=>i%3===0?[verts[i]*2+.5,verts[i+1]*2+.5]:[]),2));geo.setIndex(idx);geo.computeVertexNormals()
  part(hero.head,geo,M.stone)
  for(const s of [-1,1]) {
    oval(hero.head,M.glow,s*.064,.070,.18,.023,.006,.008,16)
    rock(hero.head,M,[s*.16,.12,-.035],[.079,.19,.15],s+7)
    root(hero.head,M,[[s*.12,-.09,.09],[s*.20,.02,.045],[s*.17,.19,-.006],[s*.19,.34,-.065],[s*.28,.46,-.09]],.035)
    root(hero.head,M,[[s*.18,.25,-.03],[s*.29,.32,.00],[s*.34,.38,-.035]],.023)
    for(let i=0;i<3;i++) {
      const x=s*(.31+i*.12),y=.76+(i%2)*.09,z=-.12
      if(a.skinId==='rootbound') {
        root(hero.hips,M,[[x,y-.1,z],[x+s*.04,y+.1,z-.07],[x+s*.12,y+.27,z-.10],[x+s*.18,y+.36,z-.05]],.055-i*.009)
        root(hero.hips,M,[[x+s*.07,y+.17,z-.08],[x-s*.035,y+.29,z-.11]],.026)
        rock(hero.hips,M,[x,y-.055,z+.10],[.13,.06,.16],i+3,M.moss)
      } else if(a.skinId==='frost-relic') {
        const crystal=part(hero.hips,new THREE.ConeGeometry(.065,.35,5),M.jewel,x,y+.13,z);crystal.rotation.z=-s*.35
      } else {
        const vent=node(hero.hips,x,y,z);rod(vent,M.dark,.055,.23);ring(vent,M.trim,.062,.012,0,.12,0).rotation.x=PI/2;oval(vent,M.glow,0,.125,0,.045,.01,.045,12)
      }
    }
  }
  for(let i=0;i<7;i++) {
    const x=(i-3)*.065
    root(t,M,[[x,.06,.25],[x+.045*Math.sin(i),-.08,.29],[x-.075*Math.cos(i),-.24,.24],[x*.65,-.40,.18]],.032)
    root(t,M,[[x,-.07,.275],[x+.07,-.18,.25],[x+.09,-.25,.19]],.014)
  }
  emblem(t,M,a.skinId==='frost-relic'?'star':'tree',.083,0,.10,.326)
  const shield=hero.shield=node(hero.arms.L.elbow,-.07,-.16,.25)
  shell(shield,M,[[-.29,.38],[-.09,.49],[.28,.34],[.34,-.04],[.18,-.43],[-.10,-.55],[-.33,-.20]],{curve:.065,depth:.055,mat:M.trim})
  shell(shield,M,[[-.25,.34],[-.08,.43],[.23,.29],[.29,-.04],[.14,-.38],[-.09,-.47],[-.28,-.18]],{at:[0,0,.065],curve:.05,depth:.036,mat:M.stone})
  emblem(shield,M,'tree',.13,0,-.04,.174)
  for(let i=0;i<5;i++)root(shield,M,[[.20-i*.09,.38,.15],[.15-i*.08,.19,.18],[.26-i*.11,-.06,.19],[.1-i*.056,-.40,.12]],.025)
  const hammer=equipment(hero,hero.arms.R.glove,'Massive ancient bell hammer',[.34,.35,-.45],[0,0,-.6])
  rod(hammer,M.root,.038,1.05,0,.10,0)
  const bell=node(hammer,0,.68,0);bell.rotation.z=PI/2
  body(bell,M.stone,[[-.29,.27,.24],[-.23,.27,.24],[-.17,.17,.16],[.13,.15,.15],[.21,.07,.07]],0,0,0,.07)
  for(const y of [-.27,-.19,.13])band(bell,M.trim,y<-.20?.275:.178,y<-.20?.245:.17,y,0,.016,-PI,PI)
  emblem(bell,M,'tree',.086,0,-.05,.17)
  hero.capeStyle={width:.61,length:.69,anchor:.09,back:-.22,flare:.85,ragged:true,material:M.fabric}
  hero.modelKind='juggernaut';hero.stance='colossus';hero.bodyLean=.09;hero.legSpread=.08
}

export function buildRosterChampion(hero,a,M) {
  palette(hero,a,M)
  ;({caelan,nyra,orren,serai})[a.championId](hero,a,M)
  dressTextures(hero,M)
  const gem=node(hero.torso,0,.24,.20);hero.gem=part(gem,new THREE.OctahedronGeometry(.009),M.jewel)
  batchJoint(hero.hips)
}
