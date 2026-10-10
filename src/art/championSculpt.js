import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const PI = Math.PI

export function node(parent, x = 0, y = 0, z = 0) {
  const group = new THREE.Group()
  group.position.set(x, y, z)
  parent.add(group)
  return group
}

export function part(parent, geometry, material, x = 0, y = 0, z = 0, scale = null) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  if (scale) mesh.scale.set(...scale)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

// Anatomical cross sections, joined into a continuous surface. Each row is
// [height, half-width, half-depth, forward-offset]. No exposed ball joints.
export function sculpt(rows, segments = 20, ridge = 0) {
  const positions = [], uv = [], indices = []
  const bottom = rows[0][0], height = rows.at(-1)[0] - bottom
  for (let j = 0; j < rows.length; j++) {
    const [y, rx, rz, z = 0] = rows[j]
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * PI * 2
      const front = Math.max(0, Math.cos(a))
      positions.push(Math.sin(a) * rx, y, Math.cos(a) * rz + z + front ** 8 * ridge)
      uv.push(i / segments, (y - bottom) / height)
      if (j && i < segments) {
        const a = (j - 1) * (segments + 1) + i, b = j * (segments + 1) + i
        indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
  }
  const bottomCenter = positions.length / 3
  positions.push(0, bottom, rows[0][3] || 0)
  uv.push(.5, 0)
  const topCenter = positions.length / 3
  positions.push(0, rows.at(-1)[0], rows.at(-1)[3] || 0)
  uv.push(.5, 1)
  const top = (rows.length - 1) * (segments + 1)
  for (let i = 0; i < segments; i++) {
    indices.push(bottomCenter, i + 1, i, topCenter, top + i, top + i + 1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function oval(parent, material, x, y, z, sx, sy, sz, detail = 16) {
  return part(parent, new THREE.SphereGeometry(1, detail, 12), material, x, y, z, [sx, sy, sz])
}

export function plate(parent, material, points, depth, x = 0, y = 0, z = 0) {
  const shape = new THREE.Shape()
  points.forEach(([px, py], i) => i ? shape.lineTo(px, py) : shape.moveTo(px, py))
  shape.closePath()
  return part(parent, new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: .008, bevelSize: .008,
    bevelSegments: 2, steps: 1, curveSegments: 3,
  }), material, x, y, z)
}

export function strand(parent, material, points, radius, tip = .05) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)))
  const geometry = new THREE.TubeGeometry(path, 10, radius, 7, false)
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const t = Math.floor(i / 8) / 10
    const center = path.getPointAt(t)
    const taper = 1 - (1 - tip) * t ** 1.5
    pos.setXYZ(i, center.x + (pos.getX(i) - center.x) * taper, center.y + (pos.getY(i) - center.y) * taper, center.z + (pos.getZ(i) - center.z) * taper)
  }
  geometry.computeVertexNormals()
  return part(parent, geometry, material)
}

// Merge only within each articulated joint. Hands, elbows, knees and the
// chest ornament remain independent anchors for the existing combat rig.
export function batchJoint(group) {
  for (const child of [...group.children]) if (child.isGroup || child.isBone) batchJoint(child)
  const buckets = new Map()
  for (const child of group.children) {
    if (!child.isMesh || child.isSkinnedMesh) continue
    const list = buckets.get(child.material) || []
    list.push(child)
    buckets.set(child.material, list)
  }
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) continue
    const geometries = meshes.map(mesh => {
      mesh.updateMatrix()
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      return geometry.applyMatrix4(mesh.matrix)
    })
    const merged = mergeGeometries(geometries)
    for (const geometry of geometries) geometry.dispose()
    for (const mesh of meshes) { group.remove(mesh); mesh.geometry.dispose() }
    part(group, merged, material)
  }
}

export function buildChampion(hero, a, M) {
  const kind = a.archetype || (a.head === 'orb' ? 'mystic' : a.hair === 'horns' ? 'juggernaut' : a.head === 'classic' ? 'raider' : 'vanguard')
  const mystic = kind === 'mystic', raider = kind === 'raider', heavy = kind === 'juggernaut'
  const width = mystic ? .88 : heavy ? 1.12 : 1
  const hips = hero.hips

  // Pelvis, fitted belt, overlapping hip plates and a cloth tabard connect
  // the torso to broad thighs instead of separating into floating primitives.
  part(hips, sculpt([[-.14,.18,.13],[-.06,.235,.15],[.10,.23,.15],[.20,.19,.14]]), M.leather)
  part(hips, sculpt([[.09,.238,.16],[.17,.24,.16],[.19,.22,.15]]), M.leatherDark)
  plate(hips, M.bronze, [[-.057,.05],[.057,.05],[.065,-.025],[0,-.068],[-.065,-.025]], .018, 0, .14, .164)
  for (const s of [-1,1]) {
    const tasset = node(hips, s*.20, .03, .09)
    tasset.rotation.z = -.16*s
    tasset.rotation.y = .45*s
    plate(tasset, M.bronzeDark, [[-.09,.045],[.075,.04],[.09,-.20],[0,-.25],[-.08,-.18]], .025)
    for (let i=0;i<3;i++) part(tasset, new THREE.BoxGeometry(.13,.008,.013), M.bronze, 0,-.04-i*.06,.034)
  }
  plate(hips, M.cloth, [[-.11,.05],[.11,.05],[.14,mystic?-.52:-.29],[0,mystic?-.60:-.36],[-.14,mystic?-.52:-.29]], .006,0,-.01,.174)
  plate(hips, M.bronzeDark, [[-.012,0],[.012,0],[.015,-.24],[0,-.28],[-.015,-.24]], .004,0,-.03,.192)

  const torso = hero.torso = node(hips,0,.40,0)
  torso.scale.x = width
  part(torso, sculpt([[-.24,.19,.13],[-.11,.21,.15],[.035,.28,.18],[.18,.315,.175],[.28,.26,.14],[.34,.13,.11]]), M.leather)
  // A shaped breastplate follows ribcage, sternum and waist. Angular trim
  // and layered abdominal lames carry the silhouette at gameplay distance.
  part(torso, sculpt([[-.13,.205,.155],[-.04,.245,.185],[.11,.322,.20],[.23,.29,.18],[.28,.17,.13]], 24,.018), mystic ? M.iron : M.bronze)
  for (const s of [-1,1]) {
    plate(torso, M.bronzeDark, [[0,.04],[s*.22,.16],[s*.24,.10],[s*.12,-.07],[0,-.10]],.012,0,.075,.192)
    strand(torso,M.bronze,[[s*.035,.27,.13],[s*.17,.22,.19],[s*.29,.12,.15]],.012,.8)
  }
  for (let i=0;i<3;i++) part(torso,sculpt([[-.028,.21-i*.008,.166], [.022,.235-i*.012,.172]],20,.008),i===1?M.ironDark:M.bronzeDark,0,-.125-i*.047,0)
  part(torso,sculpt([[.26,.115,.105],[.34,.125,.10],[.37,.095,.08]]),M.ironDark)
  // The diagonal leather harness is fitted to the front contour.
  strand(torso,M.leatherDark,[[.24,.24,.18],[.11,.10,.223],[-.02,-.06,.195],[-.16,-.22,.145]],.024,.95)
  const gem = node(torso,0,.105,.233)
  plate(gem,M.bronzeDark,[[0,.064],[.042,0],[0,-.054],[-.042,0]],.012)
  hero.gem = part(gem,new THREE.OctahedronGeometry(.025),M.glow,0,0,.025,[.65,1.5,.45])

  hero.arms = {}
  for (const s of [-1,1]) {
    const arm = node(hips,s*.335*width,.62,0)
    // Interlocking deltoid, biceps and elbow coverings with larger muscle mass.
    part(arm,sculpt([[-.34,.085,.08],[-.26,.115,.115],[-.12,.14,.13],[.025,.135,.13],[.07,.10,.11]]),raider?M.skin:M.leather)
    const pauldron = node(arm,s*.026,.014,0)
    pauldron.rotation.z=-s*.12
    if(raider && s===1) pauldron.scale.setScalar(.72)
    const big = s===-1 ? 1.12 : mystic?.87:1
    part(pauldron,sculpt([[-.09,.165,.16],[-.015,.193,.17],[.07,.16,.15],[.12,.09,.10]],16,.014),s===-1?M.bronze:M.bronzeDark,0,0,0,[big,big,big])
    for(let i=0;i<2;i++) part(pauldron,sculpt([[-.025,.173-i*.009,.166-i*.012],[.018,.185-i*.01,.172-i*.012]],16),M.ironDark,s*.02,-.10-i*.06,0)
    if(heavy) for(let i=0;i<3;i++) strand(pauldron,M.bone,[[s*(.06+i*.045),.08,-.10+i*.09],[s*(.11+i*.07),.19,-.13+i*.085],[s*(.17+i*.08),.28,-.16+i*.08]],.035)
    else plate(pauldron,M.bronze,[[0,.10],[.055,0],[0,-.055],[-.055,0]],.008,s*.08,.025,.176)
    const elbow = node(arm,0,-.34,0)
    oval(elbow,M.leatherDark,0,0,0,.10,.10,.095)
    part(elbow,sculpt([[-.245,.065,.068],[-.17,.086,.09],[-.035,.115,.108],[.035,.085,.08]]),raider?M.skin:M.leather)
    part(elbow,sculpt([[-.215,.075,.077],[-.17,.095,.096],[-.055,.111,.12],[-.005,.072,.10]]),M.iron,0,0,.007)
    plate(elbow,M.bronze,[[0,.08],[.063,.015],[.05,-.13],[0,-.17],[-.05,-.13],[-.063,.015]],.008,0,-.07,.109)
    const glove = node(elbow,0,-.285,.014)
    part(glove,sculpt([[-.07,.052,.042],[-.01,.078,.059],[.05,.067,.052],[.075,.057,.045]]),M.leatherDark)
    for(let f=0;f<4;f++) {
      const finger = oval(glove,M.leatherDark,(f-1.5)*.032,-.071,.036,.017,.046,.022,10)
      finger.rotation.x=-.20
      oval(glove,M.iron,(f-1.5)*.032,-.025,.060,.015,.022,.015,10)
    }
    const thumb=oval(glove,M.leatherDark,-s*.076,-.012,.04,.026,.048,.028,10)
    thumb.rotation.z=-s*.5
    hero.arms[s<0?'L':'R']={pivot:arm,elbow,glove}
  }

  hero.legs = {}
  for(const s of [-1,1]) {
    const leg=node(hips,s*.135,0,0)
    part(leg,sculpt([[-.44,.084,.082],[-.32,.113,.10],[-.17,.145,.134],[.015,.145,.145],[.065,.105,.11]]),M.leather)
    plate(leg,M.bronzeDark,[[0,.13],[.10,.05],[.078,-.13],[0,-.17],[-.078,-.13],[-.10,.05]],.016,0,-.16,.121)
    const knee=node(leg,0,-.43,0)
    part(knee,sculpt([[-.345,.071,.07],[-.22,.10,.106],[-.08,.111,.10],[.05,.084,.08]]),M.leatherDark)
    plate(knee,M.bronze,[[0,.08],[.08,.035],[.071,-.052],[0,-.087],[-.071,-.052],[-.08,.035]],.025,0,0,.091)
    plate(knee,M.iron,[[0,.04],[.076,-.01],[.065,-.26],[0,-.32],[-.065,-.26],[-.076,-.01]],.022,0,-.045,.097)
    part(knee,sculpt([[-.47,.112,.20,.065],[-.43,.118,.211,.07],[-.38,.11,.20,.07],[-.33,.076,.093],[ -.27,.071,.072]]),M.leatherDark)
    part(knee,sculpt([[-.475,.113,.202,.065],[-.455,.119,.214,.07]]),M.ironDark)
    oval(knee,M.iron,0,-.388,.169,.107,.041,.107)
    hero.legs[s<0?'L':'R']={pivot:leg,knee}
  }

  const head=hero.head=node(hips,0,.91,0)
  part(head,sculpt([[-.225,.08,.075],[-.10,.072,.075]]),M.skin)
  const skull=part(head,sculpt([[-.155,.064,.078,.021],[-.126,.102,.10,.009],[-.062,.132,.112],[.028,.144,.131],[.117,.133,.125,-.01],[.169,.094,.085,-.017],[.185,.025,.022,-.015]],28),M.skin)
  skull.name='Sculpted face'
  // Brow planes, cheekbones, nose bridge, lips, ears and inset eyes establish
  // a face rather than a painted sphere. All sit on the skull surface.
  for(const s of [-1,1]) {
    oval(head,M.skin,s*.137,-.004,-.003,.023,.056,.032)
    const eye=oval(head,M.ironDark,s*.062,.016,.121,.038,.013,.016)
    eye.rotation.z=s*.10
    oval(head,M.bone,s*.062,.017,.133,.024,.007,.006)
    oval(head,M.glow,s*.058,.017,.139,.008,.007,.004,10)
    const brow=oval(head,M.skin,s*.062,.044,.12,.049,.020,.019)
    brow.rotation.z=s*.17
    const eyebrow=oval(head,M.hair,s*.063,.057,.124,.043,.009,.009)
    eyebrow.rotation.z=s*.15
  }
  part(head,sculpt([[-.04,.021,.019,.143],[-.024,.030,.031,.147],[.029,.018,.023,.135],[.073,.013,.012,.119]],12),M.skin)
  oval(head,M.paint,0,-.086,.104,.044,.005,.006)
  oval(head,M.skin,0,-.097,.103,.038,.007,.01)
  if(a.head==='visor') {
    part(head,sculpt([[.071,.15,.137],[.136,.139,.13],[.195,.10,.088],[.208,.025,.03]],20,.01),M.iron)
    for(const s of [-1,1]) {
      plate(head,M.ironDark,[[s*.103,.07],[s*.16,.02],[s*.133,-.13],[s*.08,-.16],[s*.093,-.033]],.015,0,0,.078)
      const brow=plate(head,M.bronze,[[0,.08],[s*.139,.069],[s*.14,.038],[s*.048,.048],[0,.018]],.012,0,0,.127)
      brow.rotation.y=s*.10
    }
    plate(head,M.iron,[[0,.08],[.025,.025],[.018,-.06],[0,-.083],[-.018,-.06],[-.025,.025]],.028,0,0,.136)
    plate(head,M.bronzeDark,[[-.08,-.12],[0,-.154],[.08,-.12],[.07,-.168],[0,-.193],[-.07,-.168]],.012,0,0,.093)
  } else if(a.head==='orb') {
    for(const s of [-1,1]) plate(head,M.bone,[[s*.012,.10],[s*.125,.118],[s*.145,.03],[s*.12,-.04],[s*.086,-.12],[s*.067,-.08],[s*.084,.018],[s*.035,.05]],.014,0,0,.115)
    plate(head,M.bronzeDark,[[0,.14],[.028,.096],[0,.051],[-.028,.096]],.006,0,0,.15)
    part(head,new THREE.OctahedronGeometry(.015),M.glow,0,.097,.171,[.65,1.4,.5])
  } else {
    // A narrow scar, face paint and a cut beard give the unmasked raider identity.
    strand(head,M.paint,[[.082,.117,.087],[.085,.059,.119],[.075,-.017,.122]],.007,.6)
    part(head,sculpt([[-.172,.044,.064,.026],[-.14,.079,.09,.015],[-.10,.095,.09,.006]]),M.hair)
  }

  if(a.hair==='horns') {
    for(const s of [-1,1]) {
      oval(head,M.bronzeDark,s*.135,.11,-.025,.052,.048,.065)
      strand(head,M.bone,[[s*.14,.12,-.025],[s*.23,.19,-.06],[s*.28,.33,-.12],[s*.23,.43,-.18]],.056,.02)
    }
  } else if(a.hair==='swept') {
    for(let i=-3;i<=3;i++) {
      const x=i*.032
      strand(head,M.hair,[[x,.152,.088],[x*1.1,.216,-.014],[x*1.3,.13,-.16],[x*1.15,-.09,-.20],[x*.7,-.24,-.17]],.036,.08)
    }
    for(const s of [-1,1]) strand(head,M.hair,[[s*.12,.12,.02],[s*.157,.025,-.08],[s*.143,-.19,-.16],[s*.11,-.31,-.11]],.036,.03)
  } else if(a.hair==='spikes') {
    const material=a.head==='classic'?M.hair:M.ironDark
    for(let i=0;i<7;i++) {
      const z=.12-i*.04
      strand(head,material,[[0,.14,z],[0,.22,z-.035],[0,.30-Math.abs(i-2)*.014,z-.10]],.032,.03)
    }
  }

  // An actual forged blade silhouette, with grip wrapping and crossguard.
  const weapon=node(hips,-.06,.42,-.20)
  weapon.rotation.z=-.56
  part(weapon,new THREE.CylinderGeometry(.022,.025,.32,10),M.leatherDark,0,.43,0)
  for(let i=0;i<6;i++) part(weapon,new THREE.TorusGeometry(.024,.004,5,10),M.bronzeDark,0,.30+i*.04,0).rotation.x=PI/2
  oval(weapon,M.bronze,0,.61,0,.036,.038,.028)
  plate(weapon,M.iron,[[-.046,.26],[.046,.26],[.035,-.52],[0,-.67],[-.035,-.52]],.019,0,0,-.01)
  plate(weapon,M.bronzeDark,[[-.16,.26],[-.12,.31],[0,.29],[.12,.31],[.16,.26],[.08,.255],[-.08,.255]],.035,0,0,-.018)
  batchJoint(hips)
  hero.modelKind=kind
}

/** Lightweight retainers share the champions' proportions and material language. */
export function buildRetainer(minion, M, evil) {
  const body=minion.body=node(minion.group,0,.40,0)
  part(body,sculpt([[-.14,.13,.087],[-.06,.115,.084],[.07,.148,.092],[.13,.09,.06]],14),M.cloth)
  part(body,sculpt([[-.10,.134,.09],[-.063,.13,.09]],14),M.iron)
  plate(body,M.iron,[[-.10,.07],[.10,.07],[.07,-.06],[0,-.085],[-.07,-.06]],.015,0,0,.092)
  const head=node(body,0,.205,0)
  part(head,sculpt([[-.08,.054,.06],[-.035,.089,.078],[.045,.088,.08],[.091,.05,.046]],16),M.skin)
  part(head,sculpt([[.035,.10,.091],[.075,.09,.08],[.115,.04,.04]],14),M.iron)
  for(const s of [-1,1]) {
    oval(head,M.eye,s*.036,-.006,.075,.013,.006,.005,8)
    const arm=node(body,s*.15,.035,0)
    arm.rotation.z=s*.10
    part(arm,sculpt([[-.18,.042,.04],[-.08,.054,.05],[.07,.062,.058]],12),M.cloth)
    part(arm,sculpt([[-.012,.061,.06],[.062,.069,.067],[.10,.035,.04]],12),M.iron)
    oval(arm,M.skin,0,-.18,.018,.045,.044,.04,10)
  }
  // A shield and spear make each small unit read as an equipped soldier.
  plate(body,evil?M.iron:M.shield,[[-.092,.11],[.092,.11],[.09,-.05],[0,-.15],[-.09,-.05]],.016,-.18,-.055,.11)
  part(body,new THREE.CylinderGeometry(.012,.012,.64,6),M.wood,.19,.025,.08)
  plate(body,M.iron,[[0,.12],[.026,.005],[0,-.025],[-.026,.005]],.014,.19,.36,.071)
  minion.feet=[]
  for(const s of [-1,1]) {
    const foot=node(minion.group,s*.073,.08,0)
    part(foot,sculpt([[.015,.041,.04],[.12,.048,.046],[.29,.055,.052]],12),M.cloth)
    part(foot,sculpt([[-.071,.051,.076,.028],[-.025,.059,.085,.03],[.055,.043,.042]],12),M.iron)
    minion.feet.push(foot)
  }
  batchJoint(minion.group)
}
