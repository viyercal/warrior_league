"""Compare a prepared asset revision with its pre-packing baseline, losslessly."""
import argparse
import hashlib
import json
from pathlib import Path
import struct

import numpy as np


def load(path):
    data=path.read_bytes()
    assert struct.unpack_from('<4sII',data)==(b'glTF',2,len(data))
    size,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4e4f534a and size%4==0
    document=json.loads(data[20:20+size])
    count,kind=struct.unpack_from('<II',data,20+size)
    assert kind==0x004e4942 and 28+size+count==len(data)
    binary=data[28+size:]
    assert document['buffers'][0]['byteLength']==len(binary)
    for view in document['bufferViews']:
        start=view.get('byteOffset',0)
        assert start%4==0 and start>=0 and start+view['byteLength']<=len(binary)
    return document,binary


def view_bytes(document,binary,index):
    view=document['bufferViews'][index]
    start=view.get('byteOffset',0)
    return binary[start:start+view['byteLength']]


def values(document,binary,index):
    entry=document['accessors'][index]
    view=document['bufferViews'][entry['bufferView']]
    assert 'byteStride' not in view and 'sparse' not in entry and not entry.get('normalized')
    widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
    dtypes={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
    return np.frombuffer(view_bytes(document,binary,entry['bufferView']),dtype=dtypes[entry['componentType']],
                         offset=entry.get('byteOffset',0),count=entry['count']*widths[entry['type']])


def compare(before,after):
    a,ab=load(before);b,bb=load(after)
    pa=a['meshes'][0]['primitives'][0];pb=b['meshes'][0]['primitives'][0]
    assert pa['attributes'].keys()==pb['attributes'].keys()
    for semantic in pa['attributes']:
        av=values(a,ab,pa['attributes'][semantic]);bv=values(b,bb,pb['attributes'][semantic])
        assert np.array_equal(av,bv),f'{semantic} changed'
    assert np.array_equal(values(a,ab,pa['indices']),values(b,bb,pb['indices']))
    assert a['meshes'][0]['extras']==b['meshes'][0]['extras']
    for key in ['nodes','scenes','scene','textures','materials','extensionsUsed','extensionsRequired']:
        assert a.get(key)==b.get(key),f'{key} changed'
    assert len(a['images'])==len(b['images'])
    for ai,bi in zip(a['images'],b['images']):
        assert ai['mimeType']==bi['mimeType']
        assert view_bytes(a,ab,ai['bufferView'])==view_bytes(b,bb,bi['bufferView']), 'Embedded image changed'
    used=set(pb['attributes'].values())|{pb['indices']}
    assert used==set(range(len(b['accessors']))),'Unreferenced accessor remains'
    used_views={entry['bufferView'] for entry in b['accessors']+b['images']}
    assert used_views==set(range(len(b['bufferViews']))),'Unreferenced buffer view remains'
    assert b['accessors'][pb['attributes']['_RIGINDEX']]['componentType']==5121
    before_bytes=before.stat().st_size;after_bytes=after.stat().st_size
    assert after_bytes<before_bytes
    return dict(champion=after.stem,beforeBytes=before_bytes,afterBytes=after_bytes,savedBytes=before_bytes-after_bytes,
                savedPercent=round((before_bytes-after_bytes)/before_bytes*100,2),
                beforeSha256=hashlib.sha256(before.read_bytes()).hexdigest(),
                afterSha256=hashlib.sha256(after.read_bytes()).hexdigest(),
                exactGeometry=True,exactRigWeights=True,exactEmbeddedImages=True,noUnusedBufferViews=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('--current',type=Path,default=Path('public/models/champions'))
    parser.add_argument('--output',type=Path,default=Path('docs/champion-packing-data-results.json'))
    args=parser.parse_args()
    report={'assets':[compare(args.baseline/f'{name}.glb',args.current/f'{name}.glb') for name in ['caelan','nyra']]}
    report['savedBytes']=sum(asset['savedBytes'] for asset in report['assets'])
    args.output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
