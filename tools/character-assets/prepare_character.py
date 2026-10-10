"""Fit exported TRELLIS characters to Warrior League's gameplay anchors.

Preserves the provider's embedded PBR textures and UVs. Authoring landmarks
are normalized by body height and should be checked against each mesh in the
asset studio. The generated weights are a starting rig, not human retopology.
"""
import argparse
import io
import json
import struct
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import sparse

PROFILES = {
    'caelan': dict(height=2.02, hip=.50, shoulder=[.137,.79,.0], elbow=[.197,.655,.005], hand=[.236,.525,.018], knee=[.108,.27,.025], head=.856, chest=.64, boundary=.118),
    'nyra': dict(height=1.81, hip=.51, shoulder=[.119,.785,.0], elbow=[.181,.665,.004], hand=[.249,.513,.012], knee=[.098,.27,.018], head=.854, chest=.64, boundary=.103),
    'orren': dict(height=2.34, hip=.49, shoulder=[.187,.765,.0], elbow=[.247,.626,.002], hand=[.29,.469,.02], knee=[.139,.26,.022], head=.84, chest=.63, boundary=.162),
    'serai': dict(height=2.02, hip=.52, shoulder=[.109,.78,.0], elbow=[.174,.654,.005], hand=[.242,.517,.016], knee=[.092,.27,.02], head=.852, chest=.64, boundary=.103),
}
NAMES = ['pelvis','chest','head','left shoulder','left elbow','left hand','right shoulder','right elbow','right hand','left hip','left knee','right hip','right knee','back cloth','left skirt','right skirt','front cloth','lower back cloth']
PARENTS = [-1,0,1,1,3,4,1,6,7,0,9,0,11,0,0,0,0,13]

def smooth(lo, hi, x):
    t=np.clip((x-lo)/(hi-lo),0,1)
    return t*t*(3-2*t)

def read_glb(path):
    data=path.read_bytes()
    magic,version,length=struct.unpack_from('<4sII',data)
    if magic!=b'glTF' or version!=2 or length!=len(data): raise ValueError('Invalid GLB')
    size,kind=struct.unpack_from('<II',data,12)
    if kind!=0x4e4f534a: raise ValueError('Missing JSON chunk')
    doc=json.loads(data[20:20+size])
    size2,kind2=struct.unpack_from('<II',data,20+size)
    if kind2!=0x004e4942: raise ValueError('Missing binary chunk')
    return doc,bytearray(data[28+size:28+size+size2])

def accessor(doc,blob,i):
    a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']]
    if 'byteStride' in v or 'sparse' in a: raise ValueError('Unexpected interleaved or sparse provider data')
    types={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}
    sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
    return np.frombuffer(blob,dtype=types[a['componentType']],offset=v.get('byteOffset',0)+a.get('byteOffset',0),count=a['count']*sizes[a['type']]).reshape(a['count'],sizes[a['type']]).copy()

def append_accessor(doc,blob,array,component,kind,limits=False):
    while len(blob)%4: blob.append(0)
    index=len(doc['accessors']);view=len(doc['bufferViews'])
    data=array.tobytes()
    doc['bufferViews'].append(dict(buffer=0,byteOffset=len(blob),byteLength=len(data)))
    a=dict(bufferView=view,componentType=component,count=len(array),type=kind)
    if limits: a.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
    doc['accessors'].append(a);blob.extend(data)
    return index

def replace_positions(doc,blob,index,positions):
    """Reuse the provider's position storage without retaining a second body.

    This is deliberately limited to the provider's isolated, packed float32
    position view. Reject layouts that would overwrite another attribute.
    """
    a=doc['accessors'][index];view_index=a['bufferView'];view=doc['bufferViews'][view_index]
    if any('sparse' in other for other in doc['accessors']):
        raise ValueError('Sparse provider accessors require explicit materialization')
    data=positions.astype('<f4').tobytes()
    if (a['componentType']!=5126 or a['type']!='VEC3' or a.get('normalized')
            or a.get('byteOffset',0)!=0 or 'sparse' in a or 'byteStride' in view
            or view.get('buffer',0)!=0 or view['byteLength']!=len(data)
            or a['count']!=len(positions)):
        raise ValueError('Position replacement requires an isolated packed float32 view')
    if (any(other.get('bufferView')==view_index for i,other in enumerate(doc['accessors']) if i!=index)
            or any(image.get('bufferView')==view_index for image in doc.get('images',[]))):
        raise ValueError('Provider position storage is shared with other data')
    start=view.get('byteOffset',0);end=start+len(data)
    if start<0 or end>len(blob): raise ValueError('Position view exceeds the binary payload')
    for i,other in enumerate(doc['bufferViews']):
        at=other.get('byteOffset',0)
        if i!=view_index and at<end and at+other['byteLength']>start:
            raise ValueError('Provider position storage overlaps another view')
    blob[start:end]=data
    a.update(min=positions.min(axis=0).tolist(),max=positions.max(axis=0).tolist())

def prepare(source,target,champion):
    profile=PROFILES[champion]
    doc,blob=read_glb(source)
    if len(doc['meshes'])!=1 or len(doc['meshes'][0]['primitives'])!=1: raise ValueError('Expected one unified provider mesh')
    if any(any(k in n for k in ['matrix','translation','rotation','scale']) for n in doc['nodes']): raise ValueError('Provider node transforms require explicit baking')
    if doc.get('skins') or doc.get('animations') or doc['meshes'][0].get('extras',{}).get('warriorRig'):
        raise ValueError('Expected an unrigged provider export, not an already prepared character')
    primitive=doc['meshes'][0]['primitives'][0];attributes=primitive['attributes']
    if primitive.get('targets'): raise ValueError('Provider morph targets require explicit baking')
    raw=accessor(doc,blob,attributes['POSITION'])
    lo,hi=raw.min(axis=0),raw.max(axis=0)
    p=raw.astype(np.float64);p[:,0]-=(lo[0]+hi[0])/2;p[:,1]-=lo[1];p/=hi[1]-lo[1]
    x,y,z=p.T;ax=np.abs(x);height=profile['height'];hip=profile['hip']
    joints=[[0,hip,0],[0,profile['chest'],0],[0,profile['head'],.008]]
    for s in [-1,1]:
        for key in ['shoulder','elbow','hand']:
            a=profile[key];joints.append([s*a[0],a[1],a[2]])
    for s in [-1,1]:
        a=profile['knee'];joints.extend([[s*a[0]*.7,hip-.015,0],[s*a[0],a[1],a[2]]])
    joints.extend([[0,hip,-.065],[-.10,hip,.015],[.10,hip,.015],[0,hip,.070],[0,.31,-.085]])
    joints=np.array(joints)
    weights=np.zeros((len(p),len(joints)),dtype=np.float64)
    chest=smooth(hip-.015,profile['chest']+.01,y)
    head=smooth(profile['head']-.04,profile['head']+.015,y)*(1-smooth(.10,.16,ax))
    weights[:,0]=1-chest;weights[:,1]=chest*(1-head);weights[:,2]=chest*head
    # The boundaries follow the negative space between torso and upper arms.
    boundary=profile['boundary']+np.clip(.72-y,0,.25)*.22
    arm=smooth(boundary-.016,boundary+.016,ax)*(1-smooth(.83,.875,y))*smooth(.36,.46,y)
    for side,base in [(-1,3),(1,6)]:
        a=arm*(x*side>0)
        elbow=smooth(profile['elbow'][1]-.035,profile['elbow'][1]+.035,y)
        hand=1-smooth(profile['hand'][1]-.012,profile['hand'][1]+.035,y)
        weights[:,base]=a*elbow;weights[:,base+1]=a*(1-elbow)*(1-hand);weights[:,base+2]=a*(1-elbow)*hand
    weights[:,:3]*=(1-arm[:,None])
    leg=(1-smooth(hip-.07,hip+.005,y))*(1-arm)
    weights[:,:3]*=(1-leg[:,None]/np.maximum(1-arm[:,None],1e-8))
    right=smooth(-.018,.018,x)
    knee=smooth(profile['knee'][1]-.035,profile['knee'][1]+.035,y)
    for s,base in [(1,11),(-1,9)]:
        a=leg*(right if s==1 else 1-right)
        weights[:,base]=a*knee;weights[:,base+1]=a*(1-knee)
    # Identify hanging textile surfaces from the original UV atlas. This reads
    # pixels to assign deformation weights; it does not repaint the texture.
    uv=accessor(doc,blob,attributes['TEXCOORD_0'])
    material=doc['materials'][primitive['material']]
    tex=doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
    image=doc['images'][tex.get('source',tex.get('extensions',{}).get('EXT_texture_webp',{}).get('source'))]
    v=doc['bufferViews'][image['bufferView']]
    pixels=np.asarray(Image.open(io.BytesIO(blob[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB'))/255
    cols=np.clip((uv[:,0]*(pixels.shape[1]-1)).astype(int),0,pixels.shape[1]-1)
    rows=np.clip((uv[:,1]*(pixels.shape[0]-1)).astype(int),0,pixels.shape[0]-1)
    r,g,b=pixels[rows,cols].T
    if champion=='caelan': fabric=((b>r*1.22)&(b>g*.94))|((ax<.047)&(z>.06))
    elif champion=='nyra': fabric=(r>.36)&(g>.29)&(b>.19)&(r<b*1.9)&((ax>.12)|(ax<.045))
    elif champion=='serai': fabric=((g>r*1.05)&(b>r*1.06))|((r>.38)&(g>.34)&(b>.27))
    else: fabric=(ax<.064)&(z>.09)
    cloth=fabric*(1-smooth(hip-.055,hip+.015,y))*smooth(.10,.16,y)
    if champion=='nyra': cloth*=1-smooth(.44,.485,y)
    cloth=np.clip(cloth,0,1)
    weights*=1-cloth[:,None]
    back=smooth(.015,-.055,z)
    lower=1-smooth(.26,.39,y)
    front=(1-back)*(1-smooth(.036,.073,ax))
    skirt=(1-back)-front
    weights[:,13]+=cloth*back*(1-lower);weights[:,17]+=cloth*back*lower
    weights[:,16]+=cloth*front
    weights[:,14]+=cloth*skirt*(x<0);weights[:,15]+=cloth*skirt*(x>=0)
    # UV seams duplicate vertices. Weld their weight field, then diffuse over
    # connected surface edges so adjacent triangles cannot pull apart at a
    # color-mask boundary. Disconnected costume pieces stay disconnected.
    _,weld=np.unique(np.round(p,6),axis=0,return_inverse=True)
    count=int(weld.max())+1
    sums=np.zeros((count,len(joints)));np.add.at(sums,weld,weights)
    base=sums/np.bincount(weld)[:,None]
    faces=accessor(doc,blob,primitive['indices']).reshape(-1,3)
    wf=weld[faces]
    edges=np.concatenate([wf[:,[0,1]],wf[:,[1,2]],wf[:,[2,0]]])
    edges=np.concatenate([edges,edges[:,::-1]])
    adjacency=sparse.coo_matrix((np.ones(len(edges)),(edges[:,0],edges[:,1])),shape=(count,count)).tocsr()
    adjacency.data[:]=1
    degree=np.asarray(adjacency.sum(axis=1)).ravel()
    adjacency=sparse.diags(1/np.maximum(degree,1))@adjacency
    field=base.copy()
    for _ in range(64): field=.045*base+.955*(adjacency@field)
    weights=field[weld]
    indices=np.argsort(-weights,axis=1)[:,:4]
    values=np.take_along_axis(weights,indices,axis=1)
    values/=values.sum(axis=1,keepdims=True)
    if not np.isfinite(values).all() or np.max(np.abs(values.sum(axis=1)-1))>1e-6: raise ValueError('Invalid skin weights')
    positions=p*height;positions[:,1]-=hip*height
    rigJoints=joints*height;rigJoints[:,1]-=hip*height
    replace_positions(doc,blob,attributes['POSITION'],positions.astype('<f4'))
    # Custom attributes become named BufferAttributes without making the source
    # GLB claim to contain a native glTF skeleton. Runtime creates the anchors.
    # Eighteen anchors fit exactly in unsigned bytes. Keep float32 weights and
    # all surface attributes unchanged; there is no geometry quantization.
    if len(joints)>256: raise ValueError('The byte-packed rig supports at most 256 anchors')
    attributes['_RIGINDEX']=append_accessor(doc,blob,indices.astype('u1'),5121,'VEC4')
    attributes['_RIGWEIGHT']=append_accessor(doc,blob,values.astype('<f4'),5126,'VEC4')
    rig=dict(version=4,championId=champion,height=height,hipHeight=hip*height,joints=rigJoints.tolist(),parents=PARENTS,names=NAMES,
             armRestAngle=float(np.arctan2(profile['elbow'][0]-profile['shoulder'][0],profile['shoulder'][1]-profile['elbow'][1])))
    doc['meshes'][0].setdefault('extras',{})['warriorRig']=rig
    doc['meshes'][0]['name']=f'{champion}: unified textured character'
    while len(blob)%4: blob.append(0)
    doc['buffers'][0]['byteLength']=len(blob)
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    result=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(blob))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(blob),0x004e4942)+blob
    target.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent,suffix='.glb',delete=False) as stream:
        temporary=Path(stream.name)
        try:
            stream.write(result);stream.flush()
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    report=dict(champion=champion,source=str(source),output=str(target),vertices=len(p),triangles=int(doc['accessors'][primitive['indices']]['count']/3),bytes=len(result),rig=rig,
                clothVertices=int((cloth>.5).sum()),maxWeightError=float(np.max(np.abs(values.sum(axis=1)-1))))
    target.with_suffix('.rig.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='rig'}))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('champion',choices=PROFILES);parser.add_argument('source',type=Path);parser.add_argument('target',type=Path)
    args=parser.parse_args();prepare(args.source,args.target,args.champion)
