import * as THREE from 'three'
import { node, part, sculpt, strand, oval } from './championSculpt.js'

export { node, part, strand, oval, plate, batchJoint } from './championSculpt.js'

// Interpolate anatomical sections before revolving them. The joints overlap
// beneath clothing, so articulated limbs keep a continuous outer silhouette.
export function surface(rows, segments = 28, ridge = 0, crag = 0) {
  const dense = []
  const at = (i, c) => rows[Math.max(0, Math.min(rows.length - 1, i))][c] || 0
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < 4; j++) {
    const t = j / 4, row = [THREE.MathUtils.lerp(rows[i][0], rows[i + 1][0], t)]
    for (let c = 1; c < 4; c++) {
      const p = at(i - 1, c), a = at(i, c), b = at(i + 1, c), n = at(i + 2, c)
      const v = .5 * ((2 * a) + (-p + b) * t + (2*p - 5*a + 4*b - n)*t*t + (-p + 3*a - 3*b + n)*t*t*t)
      row.push(c < 3 ? Math.max(.003, v) : v)
    }
    dense.push(row)
  }
  dense.push(rows.at(-1))
  const geo = sculpt(dense, segments, ridge)
  if (crag) {
    const p = geo.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const v = 1 + crag * (Math.sin(x*41 + y*25)*Math.cos(z*37-y*9) + .4*Math.sin(y*79+z*20))
      p.setXYZ(i, x*v, y, z*v)
    }
    geo.computeVertexNormals()
  }
  return geo
}

export function body(parent, mat, rows, x = 0, y = 0, z = 0, crag = 0) {
  return part(parent, surface(rows, crag ? 22 : 28, 0, crag), mat, x, y, z)
}

export function ring(parent, mat, radius, tube, x = 0, y = 0, z = 0, arc = Math.PI*2) {
  return part(parent, new THREE.TorusGeometry(radius, tube, 6, 32, arc), mat, x, y, z)
}

export function rod(parent, mat, r, length, x = 0, y = 0, z = 0) {
  return part(parent, new THREE.CylinderGeometry(r, r, length, 12), mat, x, y, z)
}

// Curved metal bands conform to breastplates and greaves, not flat decals.
export function band(parent, mat, rx, rz, y, z = 0, thickness = .008, start = -1.3, end = 1.3) {
  const points = Array.from({length: 13}, (_, i) => {
    const a = start + (end-start)*i/12
    return [Math.sin(a)*rx, y, Math.cos(a)*rz + z]
  })
  strand(parent, mat, points, thickness, 1)
}

export function emblem(parent, M, kind, radius = .08, x = 0, y = 0, z = 0) {
  const g = node(parent, x, y, z)
  oval(g, M.dark, 0, 0, -.007, radius, radius, .015)
  ring(g, M.trim, radius, .005)
  if (kind === 'sun') {
    oval(g, M.trim, 0,0,.012, radius*.35,radius*.35,.015)
    for (let i=0;i<12;i++) {
      const a=i*Math.PI/6
      strand(g, M.trim, [[Math.sin(a)*radius*.5,Math.cos(a)*radius*.5,.012],[Math.sin(a)*radius*.85,Math.cos(a)*radius*.85,.008]], .0035, .4)
    }
  } else if (kind === 'tree') {
    strand(g,M.trim,[[0,-radius*.8,.014],[0,-.01,.026],[-radius*.15,radius*.6,.015]],.008,.3)
    for(let i=0;i<3;i++) for(const s of [-1,1]) strand(g,M.trim,[[0,-radius*(.5-i*.3),.018],[s*radius*.35,radius*(i*.25-.2),.022],[s*radius*(.85-i*.2),radius*(.05+i*.3),.014]],.005,.15)
  } else {
    const n = kind === 'star' ? 6 : 3
    for(let i=0;i<n;i++) {
      const a=i*Math.PI*2/n
      strand(g,M.trim,[[0,0,.02],[Math.sin(a)*radius*.82,Math.cos(a)*radius*.82,.012]],.004,.45)
    }
    ring(g,M.trim,radius*.55,.003,0,0,.018).rotation.y=.7
    oval(g,M.jewel,0,0,.032,radius*.25,radius*.25,.018)
  }
  return g
}

// A tailored curved textile panel with sewn edging. Its whole group swings
// from its attachment; cloth and embroidery always move together.
export function drape(hero, parent, M, { x=0,y=0,z=0,width=.22,length=.65,flare=1.3,back=0,color=M.fabric,trim=true,phase=0 } = {}) {
  const g = node(parent,x,y,z), positions=[],uv=[],indices=[]
  const sample = (u,v) => [u*width*.5*(1+(flare-1)*v),-v*length,back*v + Math.cos(u*Math.PI*3)*.012*v + .022*Math.sin(v*Math.PI)]
  for(let j=0;j<=12;j++) for(let i=0;i<=8;i++) {
    const u=i/4-1,v=j/12
    positions.push(...sample(u,v)); uv.push(i/8,1-v)
    if(j<12 && i<8) { const a=j*9+i; indices.push(a,a+9,a+1,a+1,a+9,a+10) }
  }
  const geo=new THREE.BufferGeometry()
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals()
  part(g,geo,color)
  if(trim) for(const side of [-.93,.93]) strand(g,M.trim,Array.from({length:9},(_,i)=>sample(side,i/8).map((c,k)=>k===2?c+.005:c)),.004,1)
  hero.secondaryMotion.push({group:g,phase,amount:.07,axis:'x',base:0})
  return g
}
